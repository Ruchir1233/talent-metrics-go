import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sendEmail(opts: {
  smtpHost: string; smtpPort: number;
  username: string; password: string;
  from: string; to: string;
  subject: string; html: string; messageId: string;
}) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const conn = await Deno.connectTls({
    hostname: opts.smtpHost,
    port: opts.smtpPort,
  });

  // Read all available data until we get a complete response
  const readFull = async (): Promise<string> => {
    let result = "";
    while (true) {
      const buf = new Uint8Array(4096);
      const n = await conn.read(buf);
      if (!n) break;
      result += decoder.decode(buf.subarray(0, n));
      // SMTP responses end with "CODE " (space after code = last line)
      const lines = result.split("\r\n").filter(Boolean);
      const lastLine = lines[lines.length - 1] || "";
      if (lastLine.length >= 4 && lastLine[3] === " ") break;
      // Also break if we have a complete single line response
      if (result.endsWith("\r\n") && lines.length > 0 && lines[lines.length-1][3] === " ") break;
    }
    return result;
  };

  const write = async (s: string) => {
    const data = encoder.encode(s);
    let written = 0;
    while (written < data.length) {
      written += await conn.write(data.subarray(written));
    }
  };

  const expect = async (code: string): Promise<string> => {
    const res = await readFull();
    // Check if any line starts with the expected code + space (last line of multi-line)
    const lines = res.split("\r\n").filter(Boolean);
    const success = lines.some(l => l.startsWith(`${code} `));
    if (!success) {
      throw new Error(`Expected ${code}, got: ${lines[lines.length - 1]?.trim()}`);
    }
    return res;
  };

  try {
    await expect("220"); // greeting

    await write(`EHLO kaapro.in\r\n`);
    await expect("250"); // EHLO response (multi-line)

    await write(`AUTH LOGIN\r\n`);
    await expect("334");
    await write(btoa(opts.username) + "\r\n");
    await expect("334");
    await write(btoa(opts.password) + "\r\n");
    await expect("235");

    await write(`MAIL FROM:<${opts.username}>\r\n`);
    await expect("250");

    await write(`RCPT TO:<${opts.to}>\r\n`);
    await expect("250");

    await write(`DATA\r\n`);
    await expect("354");

    const body = [
      `Message-ID: ${opts.messageId}`,
      `From: Kaapro <${opts.from}>`,
      `To: ${opts.to}`,
      `Subject: ${opts.subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      opts.html,
      `.`,
      ``,
    ].join("\r\n");

    await write(body + "\r\n");
    await expect("250");

    await write(`QUIT\r\n`);
  } finally {
    try { conn.close(); } catch (_) {}
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const results = { sent: 0, failed: 0, errors: [] as string[] };

  try {
    const { data: pendingEmails } = await supabase
      .from("email_sends")
      .select("*, email_accounts!email_account_id(*), client_leads!contact_id(*)")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .limit(20);

    if (!pendingEmails?.length) {
      return new Response(
        JSON.stringify({ message: "No emails to send" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accountSentMap: Record<string, number> = {};

    for (const emailSend of pendingEmails) {
      const account = emailSend.email_accounts;
      const contact = emailSend.client_leads;
      const campaign = emailSend.campaigns;
      if (!account || !contact) continue;

      // Skip if campaign is paused or deleted
      if (!campaign || campaign.status === "paused") continue;

      if (contact.has_replied) {
        await supabase.from("email_sends").update({ status: "skipped" }).eq("id", emailSend.id);
        continue;
      }

      const accountId = account.id;
      if (!accountSentMap[accountId]) accountSentMap[accountId] = account.sent_today ?? 0;
      if (accountSentMap[accountId] >= account.daily_limit) continue;

      const trackingPixel = `<img src="${SUPABASE_URL}/functions/v1/track-open?token=${emailSend.tracking_token}" width="1" height="1" style="display:none" />`;
      const htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#333;">${(emailSend.body_html || "").replace(/\n/g, "<br>")}</div>${EMAIL_SIGNATURE}${trackingPixel}`;
      const messageId = `<${emailSend.id}@kaapro.in>`;

      try {
        await sendEmail({
          smtpHost: account.smtp_host,
          smtpPort: account.smtp_port,
          username: account.username,
          password: account.password,
          from: account.email,
          to: contact.email,
          subject: emailSend.subject,
          html: htmlBody,
          messageId,
        });

        await supabase.from("email_sends").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          message_id: messageId,
        }).eq("id", emailSend.id);

        accountSentMap[accountId]++;
        await supabase.from("email_accounts").update({
          sent_today: accountSentMap[accountId],
        }).eq("id", accountId);

        await supabase.rpc("increment_campaign_sent", { campaign_id: emailSend.campaign_id });
        results.sent++;

      } catch (e: any) {
        results.failed++;
        results.errors.push(`${contact.email}: ${e.message}`);
        await supabase.from("email_sends").update({ status: "failed" }).eq("id", emailSend.id);
      }
    }

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
