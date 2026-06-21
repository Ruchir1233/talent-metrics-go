import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Mail, CheckCircle2, Circle, Bell, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Checkbox } from "@/components/ui/checkbox";
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

const PRIORITY_CONFIG = {
  High:   { label: "🔴 High",   cls: "bg-red-100 text-red-700 border-red-200" },
  Medium: { label: "🟡 Medium", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  Normal: { label: "⚪ Normal", cls: "bg-gray-100 text-gray-600 border-gray-200" },
};

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
      if (form.enable_reminder && form.recipientIds.length === 0) throw new Error("Select at least one employee to remind");
      if (form.enable_reminder && form.remind_type === "Custom" && !form.custom_date) throw new Error("Select a date for custom reminder");

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
        // Update recipients - delete old, insert new
        await supabase.from("todo_recipients").delete().eq("todo_id", editingId);
      } else {
        const { data: todo, error: todoErr } = await supabase
          .from("todos").insert(payload).select().single();
        if (todoErr) throw todoErr;
        todoId = todo.id;
      }

      // Insert recipients if reminder enabled
      if (form.enable_reminder && form.recipientIds.length > 0 && todoId) {
        const recipients = form.recipientIds.map((rid) => ({
          todo_id: todoId,
          recruiter_id: rid,
        }));
        const { error: recErr } = await supabase.from("todo_recipients").insert(recipients);
        if (recErr) throw recErr;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Task updated!" : "Task added!");
      qc.invalidateQueries({ queryKey: ["todos"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleDone = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase.from("todos").update({ done }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["todos"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTodo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("todos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task deleted");
      qc.invalidateQueries({ queryKey: ["todos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (todo: Todo & { todo_recipients: { recruiter_id: string }[] }) => {
    setEditingId(todo.id);
    const hasRecipients = todo.todo_recipients?.length > 0;
    setForm({
      title: todo.title,
      priority: todo.priority as "High" | "Medium" | "Normal",
      enable_reminder: hasRecipients,
      remind_type: todo.type === "One-time" ? "Custom" : "Daily",
      custom_date: (todo as any).custom_date ?? "",
      recipientIds: todo.todo_recipients?.map((r) => r.recruiter_id) ?? [],
    });
    setDialogOpen(true);
  };

  const sendReminder = async () => {
    setTestLoading(true);
    try {
      const res = await fetch(
        "https://ogbqxqrmtezezrcmkzkp.supabase.co/functions/v1/Email-Sender",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer sb_publishable_0ad3hcCiYRKn8t3VD32mAw_QB06ltGs`,
          },
          body: JSON.stringify({ test: true }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      if (data.message === "No pending todos") {
        toast.info("No pending tasks to send. Add a task with reminder first!");
      } else {
        toast.success("Reminder sent! Check your inbox.");
      }
    } catch (e: any) {
      toast.error("Failed: " + e.message);
    } finally {
      setTestLoading(false);
    }
  };

  const toggleEmployee = (id: string) => {
    setForm((f) => ({
      ...f,
      recipientIds: f.recipientIds.includes(id)
        ? f.recipientIds.filter((r) => r !== id)
        : [...f.recipientIds, id],
    }));
  };

  const pending = todos.filter((t) => !t.done);
  const completed = todos.filter((t) => t.done);

  const TaskCard = ({ todo, dim = false }: { todo: typeof todos[0]; dim?: boolean }) => {
    const assignedEmployees = employees.filter((r) =>
      todo.todo_recipients?.some((tr) => tr.recruiter_id === r.id)
    );
    const p = PRIORITY_CONFIG[todo.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.Normal;

    return (
      <div className={`flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/20 ${dim ? "opacity-55" : ""}`}>
        <button
          type="button"
          onClick={() => toggleDone.mutate({ id: todo.id, done: !todo.done })}
          className="mt-0.5 shrink-0"
        >
          {todo.done
            ? <CheckCircle2 className="h-5 w-5 text-green-500" />
            : <Circle className="h-5 w-5 text-muted-foreground hover:text-green-500 transition-colors" />
          }
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-medium text-sm ${dim ? "line-through text-muted-foreground" : ""}`}>
              {todo.title}
            </span>
            <Badge variant="outline" className={`text-[10px] px-1.5 ${p.cls}`}>{p.label}</Badge>
          </div>
          {assignedEmployees.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              <Bell className="h-3 w-3 text-muted-foreground" />
              {assignedEmployees.map((r) => (
                <span key={r.id} className="text-[11px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                  {r.name}
                </span>
              ))}
              {(todo as any).custom_date && (
                <span className="text-[11px] text-muted-foreground">· 📅 {(todo as any).custom_date}</span>
              )}
              {todo.type === "Daily" && (
                <span className="text-[11px] text-muted-foreground">· 🔄 Daily</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => openEdit(todo)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
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
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Todo & Reminders</h1>
          <p className="text-sm text-muted-foreground">
            Manage tasks and send daily email reminders to your team.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={sendReminder} disabled={testLoading}>
            <Mail className="h-4 w-4 mr-2" />
            {testLoading ? "Sending…" : "Send Reminder"}
          </Button>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" /> Add Task
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Total Tasks</div>
          <div className="text-2xl font-semibold">{todos.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Pending</div>
          <div className="text-2xl font-semibold text-orange-600">{pending.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Completed</div>
          <div className="text-2xl font-semibold text-green-600">{completed.length}</div>
        </CardContent></Card>
      </div>

      {/* Pending */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Circle className="h-4 w-4 text-orange-500" />
            Pending Tasks
            {pending.length > 0 && <Badge variant="secondary">{pending.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
          ) : pending.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              🎉 All done! Add new tasks above.
            </div>
          ) : (
            pending.map((todo) => <TaskCard key={todo.id} todo={todo} />)
          )}
        </CardContent>
      </Card>

      {/* Completed */}
      {completed.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Completed
              <Badge variant="secondary">{completed.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {completed.map((todo) => <TaskCard key={todo.id} todo={todo} dim />)}
          </CardContent>
        </Card>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setEditingId(null); setForm(emptyForm()); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Task" : "Add New Task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* Title */}
            <div className="space-y-2">
              <Label>Task Title <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Follow up with Hema Automation"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label>Priority</Label>
              <div className="flex gap-2">
                {(["Normal", "Medium", "High"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm({ ...form, priority: p })}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                      form.priority === p
                        ? p === "High" ? "bg-red-50 border-red-300 text-red-700"
                          : p === "Medium" ? "bg-amber-50 border-amber-300 text-amber-700"
                          : "bg-gray-100 border-gray-300 text-gray-700"
                        : "border-border text-muted-foreground hover:bg-muted/30"
                    }`}
                  >
                    {p === "High" ? "🔴" : p === "Medium" ? "🟡" : "⚪"} {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Reminder toggle */}
            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Enable Reminder</div>
                  <div className="text-xs text-muted-foreground">Send email reminder to employees</div>
                </div>
                <Switch
                  checked={form.enable_reminder}
                  onCheckedChange={(v) => setForm({ ...form, enable_reminder: v, recipientIds: [] })}
                />
              </div>

              {form.enable_reminder && (
                <div className="mt-4 space-y-3 border-t pt-3">

                  {/* Remind me on */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Remind me on</Label>
                    <div className="flex gap-2">
                      {(["Daily", "Custom"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setForm({ ...form, remind_type: t, custom_date: "" })}
                          className={`flex-1 py-1.5 rounded-md border text-xs font-medium transition-all ${
                            form.remind_type === t
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:bg-muted/30"
                          }`}
                        >
                          {t === "Daily" ? "🔄 Daily" : "📅 Custom Date"}
                        </button>
                      ))}
                    </div>
                    {form.remind_type === "Custom" && (
                      <Input
                        type="date"
                        value={form.custom_date}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => setForm({ ...form, custom_date: e.target.value })}
                        className="mt-1"
                      />
                    )}
                  </div>

                  {/* Employee multi-select */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Remind employees <span className="text-destructive">*</span></Label>
                    {employeesWithEmail.length === 0 ? (
                      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground text-center">
                        No employees with email found. Add emails in the Employees page.
                      </div>
                    ) : (
                      <div className="rounded-md border p-2 space-y-1 max-h-36 overflow-y-auto">
                        {employeesWithEmail.map((r) => (
                          <div key={r.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/30">
                            <Checkbox
                              id={`emp-${r.id}`}
                              checked={form.recipientIds.includes(r.id)}
                              onCheckedChange={() => toggleEmployee(r.id)}
                            />
                            <label htmlFor={`emp-${r.id}`} className="text-sm cursor-pointer flex-1 flex items-center justify-between">
                              <span className="font-medium">{r.name}</span>
                              <span className="text-xs text-muted-foreground">{r.email}</span>
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                    {form.recipientIds.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {form.recipientIds.length} employee{form.recipientIds.length !== 1 ? "s" : ""} selected
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDialogOpen(false); setEditingId(null); setForm(emptyForm()); }}>
              Cancel
            </Button>
            <Button onClick={() => saveTodo.mutate()} disabled={saveTodo.isPending}>
              {saveTodo.isPending ? "Saving…" : editingId ? "Update Task" : "Add Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
