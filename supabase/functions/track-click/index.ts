import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const redirect = url.searchParams.get("url") || "https://kaapro.in";

  if (token) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    await supabase.from("email_sends").update({
      clicked: true,
      clicked_at: new Date().toISOString(),
    }).eq("click_token", token).eq("clicked", false);
  }

  return new Response(null, {
    status: 302,
    headers: { "Location": redirect },
  });
});
