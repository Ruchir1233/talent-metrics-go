import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { campaignId } = await req.json();
    if (!campaignId) throw new Error("campaignId required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", campaignId).single();
    if (!campaign) throw new Error("Campaign not found");

    const { data: steps } = await supabase.from("campaign_steps").select("*").eq("campaign_id", campaignId).order("step_number");
    if (!steps?.length) throw new Error("No steps found");

    // Get mailboxes for this campaign
    const { data: mailboxes } = await supabase.from("campaign_mailboxes").select("*").eq("campaign_id", campaignId);

    // Get all active contacts in list
    const { data: allContacts } = await supabase
      .from("client_leads").select("*")
      .eq("list_id", campaign.contact_list_id)
      .eq("is_unsubscribed", false)
      .eq("is_bounced", false);
    if (!allContacts?.length) throw new Error("No contacts in list");

    const startDate = campaign.start_date ? new Date(campaign.start_date) : new Date(Date.now() + 86400000);
    const emailSends = [];

    // If we have multi-mailbox setup, split contacts
    if (mailboxes && mailboxes.length > 1) {
      const chunkSize = Math.ceil(allContacts.length / mailboxes.length);

      for (let mIdx = 0; mIdx < mailboxes.length; mIdx++) {
        const mailbox = mailboxes[mIdx];
        const contacts = allContacts.slice(mIdx * chunkSize, (mIdx + 1) * chunkSize);

        let contactIndex = 0;
        for (const contact of contacts) {
          for (const step of steps) {
            const scheduledAt = new Date(startDate);
            scheduledAt.setDate(scheduledAt.getDate() + step.delay_days);

            const dailyLimit = campaign.daily_limit || 20;
            const intervalSeconds = Math.floor(32400 / dailyLimit);
            const jitterSeconds = Math.floor(Math.random() * 120);
            const offsetSeconds = (contactIndex % dailyLimit) * intervalSeconds + jitterSeconds;
            scheduledAt.setUTCHours(3, 30, 0, 0);
            scheduledAt.setUTCSeconds(scheduledAt.getUTCSeconds() + offsetSeconds);

            const vars = {
              first_name: contact.person_name?.split(" ")[0] || "there",
              company: contact.company_name || "your company",
              industry: contact.industry || "your industry",
              location: contact.location || "your city",
            };

            const replaceVars = (text: string) =>
              text
                .replace(/\{\{\s*first[_\s]?name\s*\}\}/gi, vars.first_name)
                .replace(/\{\{\s*firstname\s*\}\}/gi, vars.first_name)
                .replace(/\{\{\s*name\s*\}\}/gi, vars.first_name)
                .replace(/\{\{\s*company[_\s]?name\s*\}\}/gi, vars.company)
                .replace(/\{\{\s*company\s*\}\}/gi, vars.company)
                .replace(/\{\{\s*industry\s*\}\}/gi, vars.industry)
                .replace(/\{\{\s*location\s*\}\}/gi, vars.location)
                .replace(/\{\{\s*city\s*\}\}/gi, vars.location);

            emailSends.push({
              campaign_id: campaignId,
              contact_id: contact.id,
              email_account_id: mailbox.email_account_id,
              step_number: step.step_number,
              subject: replaceVars(step.subject),
              body_html: replaceVars(step.body_html),
              scheduled_at: scheduledAt.toISOString(),
              status: "pending",
            });
          }
          contactIndex++;
        }

        // Update assigned_contacts on mailbox
        await supabase.from("campaign_mailboxes")
          .update({ assigned_contacts: contacts.length })
          .eq("id", mailbox.id);
      }
    } else {
      // Single mailbox - original behavior
      const accountId = mailboxes?.[0]?.email_account_id ?? campaign.email_account_id;
      let contactIndex = 0;

      for (const contact of allContacts) {
        for (const step of steps) {
          const scheduledAt = new Date(startDate);
          scheduledAt.setDate(scheduledAt.getDate() + step.delay_days);

          const dailyLimit = campaign.daily_limit || 20;
          const intervalSeconds = Math.floor(32400 / dailyLimit);
          const jitterSeconds = Math.floor(Math.random() * 120);
          const offsetSeconds = (contactIndex % dailyLimit) * intervalSeconds + jitterSeconds;
          scheduledAt.setUTCHours(3, 30, 0, 0);
          scheduledAt.setUTCSeconds(scheduledAt.getUTCSeconds() + offsetSeconds);

          const vars = {
            first_name: contact.person_name?.split(" ")[0] || "there",
            company: contact.company_name || "your company",
            industry: contact.industry || "your industry",
            location: contact.location || "your city",
          };

          const replaceVars = (text: string) =>
            text
              .replace(/\{\{\s*first[_\s]?name\s*\}\}/gi, vars.first_name)
              .replace(/\{\{\s*firstname\s*\}\}/gi, vars.first_name)
              .replace(/\{\{\s*name\s*\}\}/gi, vars.first_name)
              .replace(/\{\{\s*company[_\s]?name\s*\}\}/gi, vars.company)
              .replace(/\{\{\s*company\s*\}\}/gi, vars.company)
              .replace(/\{\{\s*industry\s*\}\}/gi, vars.industry)
              .replace(/\{\{\s*location\s*\}\}/gi, vars.location)
              .replace(/\{\{\s*city\s*\}\}/gi, vars.location);

          emailSends.push({
            campaign_id: campaignId,
            contact_id: contact.id,
            email_account_id: accountId,
            step_number: step.step_number,
            subject: replaceVars(step.subject),
            body_html: replaceVars(step.body_html),
            scheduled_at: scheduledAt.toISOString(),
            status: "pending",
          });
        }
        contactIndex++;
      }
    }

    // Insert in batches
    for (let i = 0; i < emailSends.length; i += 100) {
      const { error } = await supabase.from("email_sends").insert(emailSends.slice(i, i + 100));
      if (error) throw error;
    }

    await supabase.from("campaigns").update({
      status: "active",
      total_contacts: allContacts.length,
    }).eq("id", campaignId);

    return new Response(
      JSON.stringify({ success: true, scheduled: emailSends.length, contacts: allContacts.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
