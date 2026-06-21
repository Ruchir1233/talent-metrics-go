import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Mail, CheckCircle2, Circle, Bell } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { supabase, type Todo, type Recruiter } from "@/lib/supabase";

export const Route = createFileRoute("/todos")({
  head: () => ({ meta: [{ title: "Todo & Reminders — Kaapro" }] }),
  component: TodosPage,
});

type FormState = {
  title: string;
  notes: string;
  priority: "High" | "Normal";
  type: "Daily" | "One-time";
  recipientIds: string[];
};

const emptyForm = (): FormState => ({
  title: "",
  notes: "",
  priority: "Normal",
  type: "Daily",
  recipientIds: [],
});

function TodosPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
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

  const { data: recruiters = [] } = useQuery({
    queryKey: ["recruiters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recruiters").select("*").eq("active", true).order("name");
      if (error) throw error;
      return (data ?? []) as Recruiter[];
    },
  });

  const recruitersWithEmail = recruiters.filter((r) => r.email);

  const addTodo = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title is required");
      if (form.recipientIds.length === 0) throw new Error("Select at least one recipient");

      const { data: todo, error: todoErr } = await supabase
        .from("todos")
        .insert({
          title: form.title.trim(),
          notes: form.notes.trim() || null,
          priority: form.priority,
          type: form.type,
          done: false,
        })
        .select()
        .single();
      if (todoErr) throw todoErr;

      const recipients = form.recipientIds.map((rid) => ({
        todo_id: todo.id,
        recruiter_id: rid,
      }));
      const { error: recErr } = await supabase.from("todo_recipients").insert(recipients);
      if (recErr) throw recErr;
    },
    onSuccess: () => {
      toast.success("Task added!");
      qc.invalidateQueries({ queryKey: ["todos"] });
      setDialogOpen(false);
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

  const sendTestEmail = async () => {
    setTestLoading(true);
    try {
      const { error } = await supabase.functions.invoke("send-daily-reminder", {
        body: { test: true },
      });
      if (error) throw error;
      toast.success("Test email sent! Check your inbox.");
    } catch (e: any) {
      toast.error("Failed to send test: " + e.message);
    } finally {
      setTestLoading(false);
    }
  };

  const pending = todos.filter((t) => !t.done);
  const completed = todos.filter((t) => t.done);

  const toggleRecipient = (id: string) => {
    setForm((f) => ({
      ...f,
      recipientIds: f.recipientIds.includes(id)
        ? f.recipientIds.filter((r) => r !== id)
        : [...f.recipientIds, id],
    }));
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Todo & Reminders</h1>
          <p className="text-sm text-muted-foreground">
            Tasks are emailed daily at 10 AM IST to assigned recruiters.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={sendTestEmail} disabled={testLoading}>
            <Mail className="h-4 w-4 mr-2" />
            {testLoading ? "Sending…" : "Send Test Email"}
          </Button>
          <Button onClick={() => { setForm(emptyForm()); setDialogOpen(true); }}>
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

      {/* Pending Tasks */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Circle className="h-4 w-4 text-orange-500" />
            Pending Tasks
            {pending.length > 0 && (
              <Badge variant="secondary">{pending.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
          ) : pending.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              🎉 All tasks done! Add new ones with the button above.
            </div>
          ) : (
            pending.map((todo) => {
              const assignedRecruiters = recruiters.filter((r) =>
                todo.todo_recipients?.some((tr) => tr.recruiter_id === r.id)
              );
              return (
                <div key={todo.id} className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/20 transition-colors">
                  <button
                    type="button"
                    onClick={() => toggleDone.mutate({ id: todo.id, done: true })}
                    className="mt-0.5 shrink-0"
                  >
                    <Circle className="h-5 w-5 text-muted-foreground hover:text-green-500 transition-colors" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{todo.title}</span>
                      {todo.priority === "High" && (
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5">High</Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1.5">
                        {todo.type === "Daily" ? "🔄 Daily" : "1️⃣ One-time"}
                      </Badge>
                    </div>
                    {todo.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5">{todo.notes}</p>
                    )}
                    {assignedRecruiters.length > 0 && (
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        <Bell className="h-3 w-3 text-muted-foreground" />
                        {assignedRecruiters.map((r) => (
                          <span key={r.id} className="text-[11px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                            {r.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive shrink-0">
                        <Trash2 className="h-4 w-4" />
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
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Completed Tasks */}
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
            {completed.map((todo) => (
              <div key={todo.id} className="flex items-center gap-3 rounded-lg border p-3 opacity-60">
                <button
                  type="button"
                  onClick={() => toggleDone.mutate({ id: todo.id, done: false })}
                  className="shrink-0"
                >
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </button>
                <span className="flex-1 text-sm line-through text-muted-foreground">{todo.title}</span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive shrink-0">
                      <Trash2 className="h-4 w-4" />
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
            ))}
          </CardContent>
        </Card>
      )}

      {/* Add Task Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Task Title <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Follow up with Hema Automation"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                rows={2}
                placeholder="Any additional details…"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as "High" | "Normal" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="High">🔴 High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as "Daily" | "One-time" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Daily">🔄 Daily</SelectItem>
                    <SelectItem value="One-time">1️⃣ One-time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Send Reminder To <span className="text-destructive">*</span></Label>
              {recruitersWithEmail.length === 0 ? (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground text-center">
                  No recruiters with email found. Add emails in the Recruiters page first.
                </div>
              ) : (
                <div className="rounded-md border p-3 space-y-2">
                  {recruitersWithEmail.map((r) => (
                    <div key={r.id} className="flex items-center gap-2">
                      <Checkbox
                        id={r.id}
                        checked={form.recipientIds.includes(r.id)}
                        onCheckedChange={() => toggleRecipient(r.id)}
                      />
                      <label htmlFor={r.id} className="text-sm cursor-pointer flex-1">
                        <span className="font-medium">{r.name}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{r.email}</span>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => addTodo.mutate()} disabled={addTodo.isPending}>
              {addTodo.isPending ? "Adding…" : "Add Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
