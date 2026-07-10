import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ImapClient } from "https://deno.land/x/imap@v0.1.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results = { checked: 0, replied: 0 };

  try {
    // Get all active email accounts
    const { data: accounts } = await supabase
      .from("email_accounts").select("*").eq("is_active", true);

    if (!accounts?.length) {
      return new Response(JSON.stringify({ message: "No active accounts" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    for (const account of accounts) {
      try {
        const client = new ImapClient({
          hostname: account.imap_host,
          port: account.imap_port,
          tls: true,
          username: account.username,
          password: account.password,
        });

        await client.connect();
        await client.selectMailbox("INBOX");

        // Search for unseen messages from last 7 days
        const since = new Date();
        since.setDate(since.getDate() - 7);
        const seenUids = await client.search({ since, unseen: false });

        results.checked += seenUids.length;

        for (const uid of seenUids.slice(0, 50)) {
          try {
            const msg = await client.fetchOne(uid, { headers: true });
            const inReplyTo = msg.headers?.["in-reply-to"] || msg.headers?.["references"] || "";
            const fromEmail = msg.headers?.["from"] || "";

            if (!inReplyTo) continue;

            // Find matching sent email by message_id
            const { data: sentEmail } = await supabase
              .from("email_sends")
              .select("*, client_leads!contact_id(email)")
              .ilike("message_id", `%${inReplyTo.replace(/[<>]/g, "")}%`)
              .single();

            if (!sentEmail) continue;

            // Mark email_send as replied
            await supabase.from("email_sends").update({
              replied: true,
              replied_at: new Date().toISOString(),
            }).eq("id", sentEmail.id);

            // Mark contact as replied
            await supabase.from("client_leads").update({
              has_replied: true,
              pipeline_stage: "replied",
            }).eq("id", sentEmail.contact_id);

            // Cancel pending follow-up steps for this contact in this campaign
            await supabase.from("email_sends").update({
              status: "cancelled",
            })
              .eq("campaign_id", sentEmail.campaign_id)
              .eq("contact_id", sentEmail.contact_id)
              .eq("status", "pending");

            // Update campaign total_replied
            await supabase.from("campaigns")
              .update({ total_replied: supabase.rpc("increment", { x: 1 }) })
              .eq("id", sentEmail.campaign_id);

            results.replied++;
          } catch (_) { /* skip individual message errors */ }
        }

        await client.logout();
      } catch (imapErr: any) {
        console.error(`IMAP error for ${account.email}: ${imapErr.message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
