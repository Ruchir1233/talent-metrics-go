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

    const { data: campaign } = await supabase
      .from("campaigns").select("*").eq("id", campaignId).single();
    if (!campaign) throw new Error("Campaign not found");

    const { data: steps } = await supabase
      .from("campaign_steps").select("*")
      .eq("campaign_id", campaignId).order("step_number");
    if (!steps?.length) throw new Error("No steps found");

    const { data: mailboxes } = await supabase
      .from("campaign_mailboxes").select("*").eq("campaign_id", campaignId);

    const { data: allContacts } = await supabase
      .from("client_leads").select("*")
      .eq("list_id", campaign.contact_list_id)
      .eq("is_unsubscribed", false)
      .eq("is_bounced", false);
    if (!allContacts?.length) throw new Error("No contacts in list");

    // Base date: use tomorrow 9 AM IST if start_date is in the past
    const now = new Date();
    let startDate = campaign.start_date ? new Date(campaign.start_date) : new Date();

    // If start date is in the past, use today 9 AM IST or tomorrow
    const nineAmIST = new Date();
    nineAmIST.setUTCHours(3, 30, 0, 0); // 9 AM IST = 3:30 AM UTC
    if (nineAmIST < now) {
      // Past 9 AM today, start tomorrow
      nineAmIST.setDate(nineAmIST.getDate() + 1);
    }
    if (startDate < now) {
      startDate = nineAmIST;
    }

    // Clear existing pending emails
    await supabase.from("email_sends").delete()
      .eq("campaign_id", campaignId)
      .eq("status", "pending");

    const emailSends: any[] = [];

    const replaceVars = (text: string, contact: any) => {
      const vars = {
        first_name: contact.person_name?.split(" ")[0] || "there",
        company: contact.company_name || "your company",
        industry: contact.industry || "your industry",
        location: contact.location || "your city",
      };
      return text
        .replace(/\{\{\s*first[_\s]?name\s*\}\}/gi, vars.first_name)
        .replace(/\{\{\s*firstname\s*\}\}/gi, vars.first_name)
        .replace(/\{\{\s*name\s*\}\}/gi, vars.first_name)
        .replace(/\{\{\s*company[_\s]?name\s*\}\}/gi, vars.company)
        .replace(/\{\{\s*company\s*\}\}/gi, vars.company)
        .replace(/\{\{\s*industry\s*\}\}/gi, vars.industry)
        .replace(/\{\{\s*location\s*\}\}/gi, vars.location)
        .replace(/\{\{\s*city\s*\}\}/gi, vars.location);
    };

    const scheduleEmails = (contacts: any[], accountId: string) => {
      const dailyLimit = campaign.daily_limit || 20;

      for (let ci = 0; ci < contacts.length; ci++) {
        const contact = contacts[ci];

        for (const step of steps) {
          // Each step on same time as startDate, just different day
          const stepBaseDate = new Date(startDate);
          stepBaseDate.setDate(stepBaseDate.getDate() + step.delay_days);

          // Spread contacts 90 seconds apart (keeps same time of day)
          const intervalSeconds = 90;
          const jitterSeconds = Math.floor(Math.random() * 30);
          const offsetSeconds = ci * intervalSeconds + jitterSeconds;
          stepBaseDate.setSeconds(stepBaseDate.getSeconds() + offsetSeconds);

          emailSends.push({
            campaign_id: campaignId,
            contact_id: contact.id,
            email_account_id: accountId,
            step_number: step.step_number,
            subject: replaceVars(step.subject, contact),
            body_html: replaceVars(step.body_html, contact),
            scheduled_at: stepBaseDate.toISOString(),
            status: "pending",
          });
        }
      }
    };

    if (mailboxes && mailboxes.length > 1) {
      for (let mIdx = 0; mIdx < mailboxes.length; mIdx++) {
        const mailbox = mailboxes[mIdx];
        const base = Math.floor(allContacts.length / mailboxes.length);
        const extra = allContacts.length % mailboxes.length;
        const start = mIdx * base + Math.min(mIdx, extra);
        const end = start + base + (mIdx < extra ? 1 : 0);
        const contacts = allContacts.slice(start, end);

        scheduleEmails(contacts, mailbox.email_account_id);

        await supabase.from("campaign_mailboxes")
          .update({ assigned_contacts: contacts.length })
          .eq("id", mailbox.id);
      }
    } else {
      const accountId = mailboxes?.[0]?.email_account_id ?? campaign.email_account_id;
      scheduleEmails(allContacts, accountId);
    }

    // Insert in batches of 100
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
