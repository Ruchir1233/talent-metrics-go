import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function nowInIST(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().replace("Z", "");
}

class ImapConnection {
  private conn: Deno.TlsConn;
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();
  private tagCounter = 1;

  constructor(conn: Deno.TlsConn) {
    this.conn = conn;
  }

  private async read(): Promise<string> {
    let result = "";
    while (true) {
      const buf = new Uint8Array(8192);
      const n = await this.conn.read(buf);
      if (!n) break;
      result += this.decoder.decode(buf.subarray(0, n));
      if (result.includes("\r\n")) break;
    }
    return result;
  }

  private async readUntilOk(tag: string): Promise<string> {
    let full = "";
    while (true) {
      const chunk = await this.read();
      full += chunk;
      if (full.includes(`${tag} OK`) || full.includes(`${tag} NO`) || full.includes(`${tag} BAD`)) break;
    }
    return full;
  }

  private async write(s: string) {
    const data = this.encoder.encode(s);
    let written = 0;
    while (written < data.length) {
      written += await this.conn.write(data.subarray(written));
    }
  }

  async connect(): Promise<string> { return await this.read(); }

  async login(username: string, password: string): Promise<string> {
    const tag = `A${this.tagCounter++}`;
    await this.write(`${tag} LOGIN "${username}" "${password}"\r\n`);
    return await this.readUntilOk(tag);
  }

  async select(mailbox: string): Promise<string> {
    const tag = `A${this.tagCounter++}`;
    await this.write(`${tag} SELECT "${mailbox}"\r\n`);
    return await this.readUntilOk(tag);
  }

  async search(criteria: string): Promise<number[]> {
    const tag = `A${this.tagCounter++}`;
    await this.write(`${tag} SEARCH ${criteria}\r\n`);
    const res = await this.readUntilOk(tag);
    const match = res.match(/\* SEARCH([\d\s]*)/);
    if (!match || !match[1].trim()) return [];
    return match[1].trim().split(/\s+/).map(Number).filter(Boolean);
  }

  async fetchHeaders(uid: number): Promise<string> {
    const tag = `A${this.tagCounter++}`;
    await this.write(`${tag} FETCH ${uid} (BODY[HEADER.FIELDS (FROM SUBJECT IN-REPLY-TO REFERENCES MESSAGE-ID TO)])\r\n`);
    let full = "";
    while (true) {
      const chunk = await this.read();
      full += chunk;
      if (full.includes(`${tag} OK`) || full.includes(`${tag} NO`)) break;
    }
    return full;
  }

  async logout() {
    const tag = `A${this.tagCounter++}`;
    await this.write(`${tag} LOGOUT\r\n`);
    try { this.conn.close(); } catch (_) {}
  }
}

function extractHeader(raw: string, name: string): string {
  const regex = new RegExp(`^${name}:\\s*(.+?)(?=\\r?\\n[^\\s]|\\r?\\n\\r?\\n|$)`, "im");
  const match = raw.match(regex);
  return match ? match[1].trim() : "";
}

// Check if email is a bounce/delivery failure notification
function isBounce(from: string, subject: string): boolean {
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();

  const bounceFroms = [
    "mailer-daemon", "postmaster", "mail delivery", "delivery subsystem",
    "mail system", "delivery failure", "undeliverable", "noreply@bounce",
  ];
  const bounceSubjects = [
    "undelivered mail", "delivery failure", "delivery status notification",
    "mail delivery failed", "returned to sender", "undeliverable",
    "delivery notification", "non-delivery", "failed delivery",
  ];

  return (
    bounceFroms.some(b => fromLower.includes(b)) ||
    bounceSubjects.some(b => subjectLower.includes(b))
  );
}

// Extract bounced email address from bounce message
function extractBouncedEmail(raw: string, subject: string): string | null {
  // Try to find email in "Final-Recipient" header
  const finalRecipient = raw.match(/Final-Recipient:.*?;\s*([^\s\r\n]+)/i);
  if (finalRecipient) return finalRecipient[1].trim();

  // Try to find in subject line
  const subjectEmail = subject.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (subjectEmail) return subjectEmail[0];

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const results = { checked: 0, replied: 0, bounced: 0, errors: [] as string[] };

  try {
    const { data: accounts } = await supabase
      .from("email_accounts").select("*").eq("is_active", true);

    if (!accounts?.length) {
      return new Response(JSON.stringify({ message: "No active accounts" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    for (const account of accounts) {
      try {
        const conn = await Deno.connectTls({
          hostname: account.imap_host,
          port: account.imap_port,
        });

        const imap = new ImapConnection(conn);
        await imap.connect();
        await imap.login(account.username, account.password);
        await imap.select("INBOX");

        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const sinceStr = since.toLocaleDateString("en-GB", {
          day: "2-digit", month: "short", year: "numeric"
        }).replace(/ /g, "-");

        const uids = await imap.search(`SINCE ${sinceStr}`);
        results.checked += uids.length;

        const toCheck = uids.slice(-50);

        for (const uid of toCheck) {
          try {
            const headers = await imap.fetchHeaders(uid);

            const from = extractHeader(headers, "From");
            const subject = extractHeader(headers, "Subject");
            const inReplyTo = extractHeader(headers, "In-Reply-To").replace(/[<>]/g, "").trim();
            const references = extractHeader(headers, "References")
              .split(/\s+/).map(r => r.replace(/[<>]/g, "").trim()).filter(Boolean);

            // ── BOUNCE DETECTION ──
            if (isBounce(from, subject)) {
              // Try to find which contact bounced
              const bouncedEmail = extractBouncedEmail(headers, subject);

              if (bouncedEmail) {
                // Find the contact
                const { data: contact } = await supabase
                  .from("client_leads")
                  .select("id")
                  .ilike("email", bouncedEmail)
                  .single();

                if (contact) {
                  // Mark contact as bounced
                  await supabase.from("client_leads").update({
                    is_bounced: true,
                    pipeline_stage: "bounced",
                  }).eq("id", contact.id);

                  // Cancel all pending emails for this contact
                  await supabase.from("email_sends")
                    .update({ status: "cancelled" })
                    .eq("contact_id", contact.id)
                    .eq("status", "pending");

                  // Mark sent emails as bounced
                  await supabase.from("email_sends")
                    .update({ bounced: true })
                    .eq("contact_id", contact.id)
                    .eq("status", "sent");

                  results.bounced++;
                }
              }
              continue; // Don't process bounces as replies
            }

            // ── REPLY DETECTION ──
            if (!inReplyTo && references.length === 0) continue;

            const searchIds = [inReplyTo, ...references].filter(Boolean);
            let sentEmail = null;

            for (const msgId of searchIds) {
              const { data } = await supabase
                .from("email_sends")
                .select("id, campaign_id, contact_id, step_number")
                .ilike("message_id", `%${msgId}%`)
                .single();
              if (data) { sentEmail = data; break; }
            }

            if (!sentEmail) continue;

            const { data: existing } = await supabase
              .from("email_sends").select("replied").eq("id", sentEmail.id).single();
            if (existing?.replied) continue;

            await supabase.from("email_sends").update({
              replied: true,
              replied_at: nowInIST(),
            }).eq("id", sentEmail.id);

            await supabase.from("client_leads").update({
              has_replied: true,
              pipeline_stage: "replied",
            }).eq("id", sentEmail.contact_id);

            await supabase.from("email_sends")
              .update({ status: "cancelled" })
              .eq("campaign_id", sentEmail.campaign_id)
              .eq("contact_id", sentEmail.contact_id)
              .eq("status", "pending");

            const { data: camp } = await supabase
              .from("campaigns").select("total_replied").eq("id", sentEmail.campaign_id).single();
            if (camp) {
              await supabase.from("campaigns")
                .update({ total_replied: (camp.total_replied || 0) + 1 })
                .eq("id", sentEmail.campaign_id);
            }

            results.replied++;

          } catch (msgErr: any) {
            results.errors.push(`UID ${uid}: ${msgErr.message}`);
          }
        }

        await imap.logout();

      } catch (accountErr: any) {
        results.errors.push(`${account.email}: ${accountErr.message}`);
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
