import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get all pending todos with their recipients
    const { data: todos, error: todosErr } = await supabase
      .from("todos")
      .select("*, todo_recipients(recruiter_id)")
      .eq("done", false);

    if (todosErr) throw todosErr;
    if (!todos || todos.length === 0) {
      return new Response(JSON.stringify({ message: "No pending todos" }), { status: 200 });
    }

    // Get all recruiters with emails
    const { data: recruiters, error: recErr } = await supabase
      .from("recruiters")
      .select("*")
      .eq("active", true)
      .not("email", "is", null);

    if (recErr) throw recErr;

    // Group todos by recruiter
    const recruiterTodos: Record<string, { recruiter: any; todos: any[] }> = {};

    for (const todo of todos) {
      for (const recipient of (todo.todo_recipients || [])) {
        const recruiter = recruiters?.find((r: any) => r.id === recipient.recruiter_id);
        if (!recruiter?.email) continue;

        if (!recruiterTodos[recruiter.id]) {
          recruiterTodos[recruiter.id] = { recruiter, todos: [] };
        }
        recruiterTodos[recruiter.id].todos.push(todo);
      }
    }

    const today = new Date().toLocaleDateString("en-IN", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
      timeZone: "Asia/Kolkata",
    });

    const results = [];

    // Send email to each recruiter
    for (const { recruiter, todos: recipientTodos } of Object.values(recruiterTodos)) {
      const highPriority = recipientTodos.filter((t: any) => t.priority === "High");
      const mediumPriority = recipientTodos.filter((t: any) => t.priority === "Medium");
      const normal = recipientTodos.filter((t: any) => t.priority === "Normal");

      const taskRows = (tasks: any[]) =>
        tasks.map((t: any) => `
          <tr>
            <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;">
              <div style="font-weight:500;color:#111827;font-size:14px;">${t.title}</div>
              ${t.notes ? `<div style="color:#6b7280;font-size:12px;margin-top:2px;">${t.notes}</div>` : ""}
            </td>
            <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">
              <span style="background:${t.type === "Daily" ? "#ede9fe" : "#dbeafe"};color:${t.type === "Daily" ? "#7c3aed" : "#1d4ed8"};padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">
                ${t.type === "Daily" ? "🔄 Daily" : "1️⃣ One-time"}
              </span>
            </td>
          </tr>`).join("");

      const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    
    <!-- Header -->
    <div style="background:#6366f1;padding:28px 32px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;">K</div>
        <div>
          <div style="color:white;font-weight:700;font-size:16px;">Kaapro</div>
          <div style="color:rgba(255,255,255,0.7);font-size:12px;">Recruitment</div>
        </div>
      </div>
      <h1 style="margin:0;color:white;font-size:22px;font-weight:700;">🌅 Good Morning, ${recruiter.name}!</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">${today}</p>
    </div>

    <!-- Body -->
    <div style="padding:24px 32px;">
      <p style="margin:0 0 20px;color:#374151;font-size:14px;">
        Here are your <strong>${recipientTodos.length} pending task${recipientTodos.length !== 1 ? "s" : ""}</strong> for today:
      </p>

      ${highPriority.length > 0 ? `
      <div style="margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
          <span style="background:#fee2e2;color:#dc2626;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;">🔴 HIGH PRIORITY</span>
        </div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          ${taskRows(highPriority)}
        </table>
      </div>` : ""}

      ${mediumPriority.length > 0 ? `
      <div style="margin-bottom:20px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
          <span style="background:#fef3c7;color:#d97706;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;">🟡 MEDIUM PRIORITY</span>
        </div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          ${taskRows(mediumPriority)}
        </table>
      </div>` : ""}

      ${normal.length > 0 ? `
      <div>
        ${(highPriority.length > 0 || mediumPriority.length > 0) ? `<div style="color:#6b7280;font-size:12px;font-weight:600;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;">Normal Priority</div>` : ""}
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          ${taskRows(normal)}
        </table>
      </div>` : ""}
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #f3f4f6;text-align:center;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">
        Kaapro Recruitment · Daily Task Reminder · 10:00 AM IST
      </p>
    </div>
  </div>
</body>
</html>`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Kaapro Reminders <onboarding@resend.dev>",
          to: [recruiter.email],
          subject: `📋 Daily Tasks — ${today}`,
          html,
        }),
      });

      const result = await res.json();
      results.push({ recruiter: recruiter.name, email: recruiter.email, result });

      // Auto-delete one-time todos after sending
      const oneTimeTodos = recipientTodos.filter((t: any) => t.type === "One-time");
      for (const t of oneTimeTodos) {
        await supabase.from("todos").delete().eq("id", t.id);
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
