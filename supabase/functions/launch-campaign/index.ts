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

    // Get campaign
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns").select("*").eq("id", campaignId).single();
    if (cErr || !campaign) throw new Error("Campaign not found");

    // Get campaign steps
    const { data: steps, error: sErr } = await supabase
      .from("campaign_steps").select("*")
      .eq("campaign_id", campaignId).order("step_number");
    if (sErr || !steps?.length) throw new Error("No steps found");

    // Get contacts in list
    const { data: contacts, error: contErr } = await supabase
      .from("client_leads").select("*")
      .eq("list_id", campaign.contact_list_id)
      .eq("is_unsubscribed", false)
      .eq("is_bounced", false);
    if (contErr) throw contErr;
    if (!contacts?.length) throw new Error("No contacts in list");

    const startDate = campaign.start_date
      ? new Date(campaign.start_date)
      : new Date(Date.now() + 24 * 60 * 60 * 1000); // default tomorrow

    // Create email_sends for each contact × each step
    const emailSends = [];
    for (const contact of contacts) {
      for (const step of steps) {
        const scheduledAt = new Date(startDate);
        scheduledAt.setDate(scheduledAt.getDate() + step.delay_days);

        // Replace variables in subject and body
        const firstName = contact.person_name?.split(" ")[0] || "there";
        const company = contact.company_name || "your company";
        const industry = contact.industry || "your industry";
        const location = contact.location || "your city";

        // Replace all variable formats: {{first_name}}, {{First Name}}, {{FirstName}}, {{name}} etc.
        function replaceVars(text: string): string {
          return text
            // first_name variants
            .replace(/\{\{\s*first[_\s]?name\s*\}\}/gi, firstName)
            .replace(/\{\{\s*firstname\s*\}\}/gi, firstName)
            .replace(/\{\{\s*name\s*\}\}/gi, firstName)
            // company variants
            .replace(/\{\{\s*company[_\s]?name\s*\}\}/gi, company)
            .replace(/\{\{\s*company\s*\}\}/gi, company)
            // industry variants
            .replace(/\{\{\s*industry\s*\}\}/gi, industry)
            // location variants
            .replace(/\{\{\s*location\s*\}\}/gi, location)
            .replace(/\{\{\s*city\s*\}\}/gi, location);
        }

        let subject = replaceVars(step.subject);
        let body = replaceVars(step.body_html);

        emailSends.push({
          campaign_id: campaignId,
          contact_id: contact.id,
          email_account_id: campaign.email_account_id,
          step_number: step.step_number,
          subject,
          body_html: body,
          scheduled_at: scheduledAt.toISOString(),
          status: "pending",
        });
      }
      contactIndex++;
    }

    // Insert in batches of 100
    for (let i = 0; i < emailSends.length; i += 100) {
      const batch = emailSends.slice(i, i + 100);
      const { error } = await supabase.from("email_sends").insert(batch);
      if (error) throw error;
    }

    // Update campaign status and total_contacts
    await supabase.from("campaigns").update({
      status: "active",
      total_contacts: contacts.length,
    }).eq("id", campaignId);

    return new Response(
      JSON.stringify({ success: true, scheduled: emailSends.length, contacts: contacts.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
