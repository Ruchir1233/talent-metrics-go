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

  const read = async () => {
    const buf = new Uint8Array(4096);
    const n = await conn.read(buf);
    return decoder.decode(buf.subarray(0, n ?? 0));
  };

  const write = async (s: string) => {
    const data = encoder.encode(s);
    let written = 0;
    while (written < data.length) {
      written += await conn.write(data.subarray(written));
    }
  };

  const expect = async (code: string) => {
    const res = await read();
    if (!res.startsWith(code)) throw new Error(`SMTP error: ${res.trim()}`);
    return res;
  };

  try {
    await expect("220"); // greeting

    await write(`EHLO kaapro.in\r\n`);
    await read(); // EHLO response (may be multi-line)

    // AUTH LOGIN
    await write(`AUTH LOGIN\r\n`);
    await expect("334");
    await write(btoa(opts.username) + "\r\n");
    await expect("334");
    await write(btoa(opts.password) + "\r\n");
    await expect("235"); // auth success

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
    await expect("250"); // message accepted

    await write(`QUIT\r\n`);
  } finally {
    conn.close();
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
      if (!account || !contact) continue;

      if (contact.has_replied) {
        await supabase.from("email_sends").update({ status: "skipped" }).eq("id", emailSend.id);
        continue;
      }

      const accountId = account.id;
      if (!accountSentMap[accountId]) accountSentMap[accountId] = account.sent_today ?? 0;
      if (accountSentMap[accountId] >= account.daily_limit) continue;

      const trackingPixel = `<img src="${SUPABASE_URL}/functions/v1/track-open?token=${emailSend.tracking_token}" width="1" height="1" style="display:none;width:1px;height:1px" />`;
      const htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#333;">${(emailSend.body_html || "").replace(/\n/g, "<br>")}</div>${trackingPixel}`;
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
