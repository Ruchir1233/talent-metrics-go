import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const results = { sent: 0, failed: 0, errors: [] as string[] };

  try {
    // Get pending emails due now
    const { data: pendingEmails, error: pErr } = await supabase
      .from("email_sends")
      .select(`
        *,
        email_accounts!email_account_id(*),
        client_leads!contact_id(*)
      `)
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .limit(50);

    if (pErr) throw pErr;
    if (!pendingEmails?.length) {
      return new Response(JSON.stringify({ message: "No emails to send", ...results }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Check daily limits per account
    const accountSentMap: Record<string, number> = {};

    for (const emailSend of pendingEmails) {
      const account = emailSend.email_accounts;
      const contact = emailSend.client_leads;

      if (!account || !contact) continue;

      // Check if contact has replied — skip further steps if so
      if (contact.has_replied) {
        await supabase.from("email_sends").update({ status: "skipped" }).eq("id", emailSend.id);
        continue;
      }

      // Check daily limit
      const accountId = account.id;
      if (!accountSentMap[accountId]) accountSentMap[accountId] = account.sent_today;
      if (accountSentMap[accountId] >= account.daily_limit) continue;

      // Build tracking pixel and wrap body
      const trackingPixel = `<img src="${SUPABASE_URL}/functions/v1/track-open?token=${emailSend.tracking_token}" width="1" height="1" style="display:none" />`;

      // Convert plain text body to HTML if needed, add tracking pixel
      const isHtml = emailSend.body_html.trim().startsWith("<");
      let htmlBody = isHtml ? emailSend.body_html : emailSend.body_html.replace(/\n/g, "<br>");
      htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333;">${htmlBody}</div>${trackingPixel}`;

      // Generate Message-ID
      const messageId = `<${emailSend.id}@kaapro.in>`;

      try {
        const client = new SmtpClient();
        await client.connectTLS({
          hostname: account.smtp_host,
          port: account.smtp_port,
          username: account.username,
          password: account.password,
        });

        await client.send({
          from: `Kaapro <${account.email}>`,
          to: contact.email,
          subject: emailSend.subject,
          content: emailSend.body_html.replace(/\n/g, " ").substring(0, 200),
          html: htmlBody,
          headers: {
            "Message-ID": messageId,
            "X-Campaign-Id": emailSend.campaign_id,
          },
        });

        await client.close();

        // Mark as sent
        await supabase.from("email_sends").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          message_id: messageId,
        }).eq("id", emailSend.id);

        // Increment sent_today on account
        accountSentMap[accountId]++;
        await supabase.from("email_accounts").update({
          sent_today: accountSentMap[accountId],
        }).eq("id", accountId);

        // Update campaign total_sent
        await supabase.rpc("increment_campaign_sent", { campaign_id: emailSend.campaign_id });

        results.sent++;

      } catch (sendErr: any) {
        results.failed++;
        results.errors.push(`${contact.email}: ${sendErr.message}`);
        await supabase.from("email_sends").update({
          status: "failed",
        }).eq("id", emailSend.id);
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, ...results }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
