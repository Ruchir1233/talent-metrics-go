import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { supabase, type Todo, type Recruiter } from "@/lib/supabase";

export const Route = createFileRoute("/todos")({
  head: () => ({ meta: [{ title: "Todo & Reminders — Kaapro" }] }),
  component: TodosPage,
});

type FormState = {
  title: string;
  priority: "High" | "Medium" | "Normal";
  enable_reminder: boolean;
  remind_type: "Daily" | "Custom";
  custom_date: string;
  recipientIds: string[];
};

const emptyForm = (): FormState => ({
  title: "",
  priority: "Normal",
  enable_reminder: false,
  remind_type: "Daily",
  custom_date: "",
  recipientIds: [],
});

const AVATAR_COLORS = [
  "bg-[#6366f1]", "bg-[#06b6d4]", "bg-[#f97316]",
  "bg-[#ec4899]", "bg-[#8b5cf6]", "bg-[#10b981]", "bg-[#ef4444]",
];

function avatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={`w-6 h-6 rounded-full ${avatarColor(name)} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
      {initials}
    </div>
  );
}

function TodosPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [testLoading, setTestLoading] = useState(false);

  const { data: todos = [], isLoading } = useQuery({
    queryKey: ["todos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("todos")
        .select("*, todo_recipients(recruiter_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as (Todo & { todo_recipients: { recruiter_id: string }[] })[];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["recruiters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recruiters").select("*").eq("active", true).order("name");
      if (error) throw error;
      return (data ?? []) as Recruiter[];
    },
  });

  const employeesWithEmail = employees.filter((r) => r.email);

  const saveTodo = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title is required");
      if (form.enable_reminder && form.recipientIds.length === 0) throw new Error("Select at least one employee");
      if (form.enable_reminder && form.remind_type === "Custom" && !form.custom_date) throw new Error("Select a date");

      const payload = {
        title: form.title.trim(),
        priority: form.priority,
        type: !form.enable_reminder ? "Daily" : form.remind_type === "Daily" ? "Daily" : "One-time",
        custom_date: form.enable_reminder && form.remind_type === "Custom" ? form.custom_date : null,
        done: false,
      };

      let todoId = editingId;
      if (editingId) {
        const { error } = await supabase.from("todos").update(payload).eq("id", editingId);
        if (error) throw error;
        await supabase.from("todo_recipients").delete().eq("todo_id", editingId);
      } else {
        const { data: todo, error } = await supabase.from("todos").insert(payload).select().single();
        if (error) throw error;
        todoId = todo.id;
      }

      if (form.enable_reminder && form.recipientIds.length > 0 && todoId) {
        const { error } = await supabase.from("todo_recipients").insert(
          form.recipientIds.map((rid) => ({ todo_id: todoId, recruiter_id: rid }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Task updated!" : "Task added!");
      qc.invalidateQueries({ queryKey: ["todos"] });
      setDialogOpen(false); setEditingId(null); setForm(emptyForm());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDone = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from("todos").update({ done }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["todos"] }),
  });

  const deleteTodo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("todos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["todos"] }); },
  });

  const sendReminder = async () => {
    setTestLoading(true);
    try {
      const res = await fetch("https://ogbqxqrmtezezrcmkzkp.supabase.co/functions/v1/Email-Sender", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer sb_publishable_0ad3hcCiYRKn8t3VD32mAw_QB06ltGs" },
        body: JSON.stringify({ test: true }),
      });
      const data = await res.json();
      if (data.message === "No pending todos") toast.info("No pending tasks assigned to anyone.");
      else toast.success("Reminder sent! Check inbox.");
    } catch (e: any) { toast.error("Failed: " + e.message); }
    finally { setTestLoading(false); }
  };

  const openEdit = (todo: typeof todos[0]) => {
    setEditingId(todo.id);
    setForm({
      title: todo.title,
      priority: todo.priority as "High" | "Medium" | "Normal",
      enable_reminder: todo.todo_recipients?.length > 0,
      remind_type: todo.type === "One-time" ? "Custom" : "Daily",
      custom_date: (todo as any).custom_date ?? "",
      recipientIds: todo.todo_recipients?.map((r) => r.recruiter_id) ?? [],
    });
    setDialogOpen(true);
  };

  const toggleRecipient = (id: string) =>
    setForm((f) => ({
      ...f,
      recipientIds: f.recipientIds.includes(id)
        ? f.recipientIds.filter((r) => r !== id)
        : [...f.recipientIds, id],
    }));

  const pending = todos.filter((t) => !t.done);
  const completed = todos.filter((t) => t.done);

  const PRIORITY_BADGE: Record<string, string> = {
    High:   "bg-red-50 text-red-600 border-red-200",
    Medium: "bg-amber-50 text-amber-600 border-amber-200",
    Normal: "bg-gray-100 text-gray-500 border-gray-200",
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-bold text-[#111827] tracking-tight">Todo & Reminders</h1>
            <p className="text-[14px] text-[#6b7280] mt-0.5">Manage tasks and send daily email reminders to your team.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={sendReminder}
              disabled={testLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#e5e7eb] bg-white text-[14px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors"
            >
              <span>✉️</span> {testLoading ? "Sending…" : "Send Reminder"}
            </button>
            <button
              onClick={() => { setEditingId(null); setForm(emptyForm()); setDialogOpen(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#6366f1] text-white text-[14px] font-medium hover:bg-[#4f46e5] transition-colors"
            >
              <Plus className="h-4 w-4" /> Add Task
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "TOTAL TASKS",  value: todos.length,     color: "text-[#111827]" },
            { label: "PENDING",      value: pending.length,   color: "text-[#f97316]" },
            { label: "COMPLETED",    value: completed.length, color: "text-[#10b981]" },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-[#e5e7eb] rounded-xl p-5">
              <div className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider mb-2">{s.label}</div>
              <div className={`text-[32px] font-bold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Pending Tasks */}
        {isLoading ? (
          <div className="text-center text-[#9ca3af] py-12">Loading…</div>
        ) : (
          <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#f3f4f6]">
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <span className="text-[13px] font-bold text-[#374151] uppercase tracking-wide">Pending Tasks</span>
              </div>
              <span className="bg-[#fde68a] text-[#92400e] text-[12px] font-semibold px-3 py-0.5 rounded-full">
                {pending.length} task{pending.length !== 1 ? "s" : ""}
              </span>
            </div>

            {pending.length === 0 ? (
              <div className="text-center text-[#9ca3af] py-12 text-sm">🎉 All tasks done!</div>
            ) : (
              pending.map((todo, i) => {
                const assignedEmployees = employees.filter((r) =>
                  todo.todo_recipients?.some((tr) => tr.recruiter_id === r.id)
                );
                return (
                  <div key={todo.id} className={`flex items-start gap-4 px-5 py-4 ${i < pending.length - 1 ? "border-b border-[#f3f4f6]" : ""} hover:bg-[#fafafa] transition-colors`}>
                    {/* Checkbox */}
                    <button
                      type="button"
                      onClick={() => toggleDone.mutate({ id: todo.id, done: true })}
                      className="w-5 h-5 mt-0.5 rounded border-2 border-[#d1d5db] hover:border-[#6366f1] flex items-center justify-center shrink-0 transition-colors"
                    />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-semibold text-[#111827] mb-2">{todo.title}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {assignedEmployees.map((e) => (
                          <div key={e.id} className="flex items-center gap-1.5">
                            <Avatar name={e.name} />
                            <span className="text-[13px] text-[#374151]">{e.name}</span>
                          </div>
                        ))}
                        <span className={`text-[12px] font-medium px-2 py-0.5 rounded border ${PRIORITY_BADGE[todo.priority] ?? PRIORITY_BADGE.Normal}`}>
                          {todo.priority}
                        </span>
                        {(todo as any).custom_date ? (
                          <span className="text-[12px] text-[#6b7280] flex items-center gap-1">
                            <span>📅</span> {(todo as any).custom_date}
                          </span>
                        ) : todo.todo_recipients?.length > 0 ? (
                          <span className="text-[12px] text-[#6b7280] flex items-center gap-1">
                            <span>🔔</span> Daily
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => openEdit(todo)} className="p-1.5 rounded hover:bg-[#f3f4f6] text-[#9ca3af] hover:text-[#374151] transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button type="button" className="p-1.5 rounded hover:bg-red-50 text-[#9ca3af] hover:text-red-500 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete task?</AlertDialogTitle>
                            <AlertDialogDescription>"{todo.title}" will be permanently deleted.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteTodo.mutate(todo.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Completed Tasks */}
        {completed.length > 0 && (
          <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#f3f4f6]">
              <div className="flex items-center gap-2">
                <span>✅</span>
                <span className="text-[13px] font-bold text-[#374151] uppercase tracking-wide">Completed</span>
              </div>
              <span className="bg-[#d1fae5] text-[#065f46] text-[12px] font-semibold px-3 py-0.5 rounded-full">
                {completed.length} task{completed.length !== 1 ? "s" : ""}
              </span>
            </div>
            {completed.map((todo, i) => (
              <div key={todo.id} className={`flex items-center gap-4 px-5 py-4 ${i < completed.length - 1 ? "border-b border-[#f3f4f6]" : ""} opacity-60`}>
                <button
                  type="button"
                  onClick={() => toggleDone.mutate({ id: todo.id, done: false })}
                  className="w-5 h-5 rounded border-2 border-[#6366f1] bg-[#6366f1] flex items-center justify-center shrink-0"
                >
                  <span className="text-white text-[10px]">✓</span>
                </button>
                <span className="flex-1 text-[15px] text-[#9ca3af] line-through">{todo.title}</span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button type="button" className="p-1.5 rounded hover:bg-red-50 text-[#d1d5db] hover:text-red-500 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete task?</AlertDialogTitle>
                      <AlertDialogDescription>"{todo.title}" will be permanently deleted.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteTodo.mutate(todo.id)}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o && dialogOpen) { setDialogOpen(false); setEditingId(null); setForm(emptyForm()); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Task" : "Add New Task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Task Title <span className="text-red-500">*</span></Label>
              <Input placeholder="e.g. Follow up with Hema Automation" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <div className="flex gap-2">
                {(["Normal", "Medium", "High"] as const).map((p) => (
                  <button key={p} type="button" onClick={() => setForm({ ...form, priority: p })}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                      form.priority === p
                        ? p === "High" ? "bg-red-50 border-red-300 text-red-700"
                          : p === "Medium" ? "bg-amber-50 border-amber-300 text-amber-700"
                          : "bg-gray-100 border-gray-300 text-gray-700"
                        : "border-[#e5e7eb] text-[#9ca3af] hover:bg-[#f9fafb]"
                    }`}
                  >
                    {p === "High" ? "🔴" : p === "Medium" ? "🟡" : "⚪"} {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-[#e5e7eb] overflow-hidden">
              <div className="flex items-center justify-between p-3">
                <div>
                  <div className="text-sm font-medium text-[#111827]">Enable Reminder</div>
                  <div className="text-xs text-[#9ca3af]">Send email reminder to employees</div>
                </div>
                <Switch checked={form.enable_reminder} onCheckedChange={(v) => setForm({ ...form, enable_reminder: v, recipientIds: [] })} />
              </div>

              {form.enable_reminder && (
                <div className="border-t border-[#f3f4f6] p-3 space-y-3">
                  <div className="flex gap-2">
                    {(["Daily", "Custom"] as const).map((t) => (
                      <button key={t} type="button" onClick={() => setForm({ ...form, remind_type: t, custom_date: "" })}
                        className={`flex-1 py-1.5 rounded-md border text-xs font-medium transition-all ${
                          form.remind_type === t ? "bg-[#6366f1] text-white border-[#6366f1]" : "border-[#e5e7eb] text-[#9ca3af]"
                        }`}
                      >
                        {t === "Daily" ? "🔄 Daily" : "📅 Custom Date"}
                      </button>
                    ))}
                  </div>
                  {form.remind_type === "Custom" && (
                    <Input type="date" value={form.custom_date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setForm({ ...form, custom_date: e.target.value })} />
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Remind employees <span className="text-red-500">*</span></Label>
                    {employeesWithEmail.length === 0 ? (
                      <div className="text-xs text-[#9ca3af] border border-dashed rounded-lg p-3 text-center">No employees with email. Add emails in Employees page.</div>
                    ) : (
                      <div className="border border-[#e5e7eb] rounded-lg p-2 space-y-1 max-h-36 overflow-y-auto">
                        {employeesWithEmail.map((r) => (
                          <div key={r.id} onClick={() => toggleRecipient(r.id)} className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-colors ${form.recipientIds.includes(r.id) ? "bg-[#eef2ff]" : "hover:bg-[#f9fafb]"}`}>
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${form.recipientIds.includes(r.id) ? "border-[#6366f1] bg-[#6366f1]" : "border-[#d1d5db]"}`}>
                              {form.recipientIds.includes(r.id) && <span className="text-white text-[9px]">✓</span>}
                            </div>
                            <Avatar name={r.name} />
                            <span className="text-sm font-medium text-[#374151]">{r.name}</span>
                            <span className="text-xs text-[#9ca3af] ml-auto">{r.email}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDialogOpen(false); setEditingId(null); setForm(emptyForm()); }}>Cancel</Button>
            <Button onClick={() => saveTodo.mutate()} disabled={saveTodo.isPending}>
              {saveTodo.isPending ? "Saving…" : editingId ? "Update Task" : "Add Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
