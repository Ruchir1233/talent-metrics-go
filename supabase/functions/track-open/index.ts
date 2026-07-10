import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1x1 transparent GIF
const PIXEL = new Uint8Array([
  0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,
  0xff,0xff,0xff,0x00,0x00,0x00,0x21,0xf9,0x04,0x00,0x00,0x00,0x00,
  0x00,0x2c,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,
  0x44,0x01,0x00,0x3b,
]);

serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (token) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    // Update email_send as opened
    const { data: send } = await supabase
      .from("email_sends")
      .select("id, campaign_id, opened")
      .eq("tracking_token", token)
      .single();

    if (send && !send.opened) {
      await supabase.from("email_sends").update({
        opened: true,
        opened_at: new Date().toISOString(),
      }).eq("tracking_token", token);

      // Increment campaign total_opened
      await supabase.from("campaigns")
        .select("total_opened")
        .eq("id", send.campaign_id)
        .single()
        .then(({ data }) => {
          if (data) {
            supabase.from("campaigns").update({
              total_opened: (data.total_opened || 0) + 1
            }).eq("id", send.campaign_id);
          }
        });
    }
  }

  return new Response(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
});
