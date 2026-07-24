import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;


// Random delay between min and max seconds
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(minSeconds: number, maxSeconds: number): Promise<void> {
  const ms = (minSeconds + Math.random() * (maxSeconds - minSeconds)) * 1000;
  return sleep(ms);
}

function getSignature(fromEmail: string): string {
  if (fromEmail.includes("neet")) {
    return `
<div style="margin-top:28px;padding-top:16px;border-top:2px solid #e5e7eb;font-family:Arial,sans-serif;font-size:13px;color:#374151;line-height:1.7;">
  <div style="font-weight:700;font-size:14px;color:#0f172a;">Neet Ahir</div>
  <div style="color:#6b7280;font-size:12px;margin-bottom:8px;">Branch Head — Kaapro</div>
  <div>📞 <a href="tel:+919313317071" style="color:#374151;text-decoration:none;">+91 9313317071</a></div>
  <div>🌐 <a href="https://www.kaapro.co.in" style="color:#1d4ed8;text-decoration:none;">www.kaapro.co.in</a></div>
  <div>🔗 <a href="https://www.linkedin.com/company/kaapro-hr-consultants/" style="color:#1d4ed8;text-decoration:none;">linkedin.com/company/kaapro-hr-consultants</a></div>
  <div style="margin-top:10px;font-size:10px;color:#9ca3af;letter-spacing:0.3px;">
    Training | Consulting | Recruitment | Staffing | Assessment | Outsourcing
  </div>
</div>`;
  }
  // Default: Ruchir / sales
  return `
<div style="margin-top:28px;padding-top:16px;border-top:2px solid #e5e7eb;font-family:Arial,sans-serif;font-size:13px;color:#374151;line-height:1.7;">
  <div style="font-weight:700;font-size:14px;color:#0f172a;">Ruchir Parekh</div>
  <div style="color:#6b7280;font-size:12px;margin-bottom:8px;">Branch Head — Kaapro</div>
  <div>📞 <a href="tel:+916359826865" style="color:#374151;text-decoration:none;">+91 6359826865</a></div>
  <div>🌐 <a href="https://www.kaapro.co.in" style="color:#1d4ed8;text-decoration:none;">www.kaapro.co.in</a></div>
  <div>🔗 <a href="https://www.linkedin.com/company/kaapro-hr-consultants/" style="color:#1d4ed8;text-decoration:none;">linkedin.com/company/kaapro-hr-consultants</a></div>
  <div style="margin-top:10px;font-size:10px;color:#9ca3af;letter-spacing:0.3px;">
    Training | Consulting | Recruitment | Staffing | Assessment | Outsourcing
  </div>
</div>`;
}

async function sendEmail(opts: {
  smtpHost: string; smtpPort: number;
  username: string; password: string;
  from: string; to: string;
  subject: string; html: string; messageId: string;
  inReplyTo?: string; references?: string;
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

    const headers = [
      `Message-ID: ${opts.messageId}`,
      `From: Kaapro <${opts.from}>`,
      `To: ${opts.to}`,
      `Subject: ${opts.subject}`,
    ];
    if (opts.inReplyTo) {
      headers.push(`In-Reply-To: ${opts.inReplyTo}`);
      headers.push(`References: ${opts.references || opts.inReplyTo}`);
    }
    headers.push(`MIME-Version: 1.0`);
    headers.push(`Content-Type: text/html; charset=UTF-8`);
    headers.push(``);
    headers.push(opts.html);
    headers.push(`.`);
    headers.push(``);
    const body = headers.join("\r\n");

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

      // For Step 2 and 3, find the Step 1 message_id to thread emails
      let inReplyTo: string | undefined;
      let references: string | undefined;
      if (emailSend.step_number > 1) {
        const { data: step1 } = await supabase
          .from("email_sends")
          .select("message_id")
          .eq("campaign_id", emailSend.campaign_id)
          .eq("contact_id", emailSend.contact_id)
          .eq("step_number", 1)
          .eq("status", "sent")
          .single();
        if (step1?.message_id) {
          inReplyTo = step1.message_id;
          // For step 3, also include step 2 message_id in references
          if (emailSend.step_number === 3) {
            const { data: step2 } = await supabase
              .from("email_sends")
              .select("message_id")
              .eq("campaign_id", emailSend.campaign_id)
              .eq("contact_id", emailSend.contact_id)
              .eq("step_number", 2)
              .eq("status", "sent")
              .single();
            references = [step1.message_id, step2?.message_id].filter(Boolean).join(" ");
          } else {
            references = step1.message_id;
          }
        }
      }

      const trackingPixel = `<img src="${SUPABASE_URL}/functions/v1/track-open?token=${emailSend.tracking_token}" width="1" height="1" style="display:none" />`;
      const htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#333;">${(emailSend.body_html || "").replace(/\n/g, "<br>")}</div>${getSignature(account.email)}${trackingPixel}`;
      const messageId = `<${emailSend.id}@kaapro.in>`;

      try {
        const subject = emailSend.step_number > 1 && inReplyTo
          ? (emailSend.subject.startsWith("Re:") ? emailSend.subject : `Re: ${emailSend.subject}`)
          : emailSend.subject;

        await sendEmail({
          smtpHost: account.smtp_host,
          smtpPort: account.smtp_port,
          username: account.username,
          password: account.password,
          from: account.email,
          to: contact.email,
          subject,
          html: htmlBody,
          messageId,
          inReplyTo,
          references,
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

        // Update per-mailbox sent_count in campaign_mailboxes
        const { data: mailboxRow } = await supabase
          .from("campaign_mailboxes")
          .select("id, sent_count")
          .eq("campaign_id", emailSend.campaign_id)
          .eq("email_account_id", accountId)
          .single();
        if (mailboxRow) {
          await supabase.from("campaign_mailboxes")
            .update({ sent_count: (mailboxRow.sent_count || 0) + 1 })
            .eq("id", mailboxRow.id);
        }

        results.sent++;

        // Wait 45-90 seconds between emails to avoid spam detection
        await randomDelay(45, 90);

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
