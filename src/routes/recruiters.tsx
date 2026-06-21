import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase, type Recruiter } from "@/lib/supabase";

export const Route = createFileRoute("/recruiters")({
  head: () => ({ meta: [{ title: "Employees — Kaapro" }] }),
  component: EmployeesPage,
});

const JOB_ROLES = ["Recruiter", "Branch Head", "BDE"] as const;
type JobRole = typeof JOB_ROLES[number];

const ROLE_COLORS: Record<JobRole, string> = {
  "Recruiter":    "bg-blue-50 text-blue-700 border-blue-200",
  "Branch Head":  "bg-purple-50 text-purple-700 border-purple-200",
  "BDE":          "bg-green-50 text-green-700 border-green-200",
};

type FormState = {
  name: string;
  email: string;
  job_role: JobRole;
  years_of_experience: string;
  active: boolean;
};

const emptyForm: FormState = {
  name: "",
  email: "",
  job_role: "Recruiter",
  years_of_experience: "0",
  active: true,
};

function EmployeesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Recruiter | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["recruiters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recruiters").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Recruiter[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || null,
        job_role: form.job_role,
        years_of_experience: Number(form.years_of_experience) || 0,
        active: form.active,
      };
      if (!payload.name) throw new Error("Name is required");
      if (editing) {
        const { error } = await supabase.from("recruiters").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("recruiters").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Employee updated" : "Employee added");
      qc.invalidateQueries({ queryKey: ["recruiters"] });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("recruiters").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Employee deleted");
      qc.invalidateQueries({ queryKey: ["recruiters"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openAdd = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (r: Recruiter) => {
    setEditing(r);
    setForm({
      name: r.name,
      email: r.email ?? "",
      job_role: (r.job_role as JobRole) ?? "Recruiter",
      years_of_experience: String(r.years_of_experience),
      active: r.active,
    });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">Manage your hiring team.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" /> Add Employee
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Employee" : "Add Employee"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Malkeynoor"
                />
              </div>
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="jane@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Job Role <span className="text-destructive">*</span></Label>
                <Select
                  value={form.job_role}
                  onValueChange={(v) => setForm({ ...form, job_role: v as JobRole })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {JOB_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${ROLE_COLORS[role]}`}>
                          {role}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Years of Experience</Label>
                <Input
                  type="number" min="0" step="0.5"
                  value={form.years_of_experience}
                  onChange={(e) => setForm({ ...form, years_of_experience: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label className="text-sm">Active Status</Label>
                  <p className="text-xs text-muted-foreground">Inactive employees are hidden from reporting.</p>
                </div>
                <Switch
                  checked={form.active}
                  onCheckedChange={(v) => setForm({ ...form, active: v })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Job Role</TableHead>
                <TableHead>Experience</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : employees.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No employees yet.</TableCell></TableRow>
              ) : employees.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <Link to="/recruiter/$id" params={{ id: r.id }} className="text-primary hover:underline">
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ROLE_COLORS[(r.job_role as JobRole) ?? "Recruiter"]}>
                      {r.job_role ?? "Recruiter"}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.years_of_experience} yrs</TableCell>
                  <TableCell>
                    {r.active
                      ? <Badge>Active</Badge>
                      : <Badge variant="secondary">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                        <Pencil className="h-4 w-4 mr-1" /> Edit
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4 mr-1" /> Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete employee?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently remove {r.name}. Their past reports remain.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => del.mutate(r.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
