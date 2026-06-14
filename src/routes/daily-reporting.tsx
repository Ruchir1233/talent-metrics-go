import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Eye, X, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase, type Recruiter, type DailyReport, type PositionWorked } from "@/lib/supabase";

export const Route = createFileRoute("/daily-reporting")({
  head: () => ({ meta: [{ title: "Daily Reporting — TalentFlow" }] }),
  component: DailyReporting,
});

const numericFields = [
  { key: "cv_submitted", label: "CV Submitted" },
  { key: "interviews_scheduled", label: "Interviews Scheduled" },
  { key: "joinings", label: "Joinings" },
] as const;

type NumKey = (typeof numericFields)[number]["key"];

type FormState = {
  date: string;
  recruiter_name: string;
  remarks: string;
  positions_worked: PositionWorked[];
} & Record<NumKey, string>;

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): FormState => ({
  date: today(),
  recruiter_name: "",
  remarks: "",
  positions_worked: [],
  cv_submitted: "0",
  interviews_scheduled: "0",
  joinings: "0",
});

const emptyPosition = (): PositionWorked => ({ position_name: "", client_name: "", cv_count: 0 });

function DailyReporting() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewPositions, setViewPositions] = useState<{ report: DailyReport } | null>(null);

  const { data: recruiters = [] } = useQuery({
    queryKey: ["recruiters", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recruiters").select("*").eq("active", true).order("name");
      if (error) throw error;
      return (data ?? []) as Recruiter[];
    },
  });

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["daily_reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_reports").select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DailyReport[];
    },
  });

  // MTD totals for selected recruiter (only for Add mode)
  const recruiterMTD = useMemo(() => {
    if (!form.recruiter_name || editingId) return null;
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const relevant = reports.filter(
      (r) => r.recruiter_name === form.recruiter_name && r.date >= monthStart,
    );
    return relevant.reduce(
      (acc, r) => ({
        cv: acc.cv + (Number(r.cv_submitted) || 0),
        interviews: acc.interviews + (Number(r.interviews_scheduled) || 0),
        joinings: acc.joinings + (Number(r.joinings) || 0),
      }),
      { cv: 0, interviews: 0, joinings: 0 },
    );
  }, [form.recruiter_name, editingId, reports]);

  const resetForm = () => { setForm(emptyForm()); setEditingId(null); };
  const closeDialog = () => { setDialogOpen(false); resetForm(); };

  // Position worked helpers
  const addPosition = () =>
    setForm((f) => ({ ...f, positions_worked: [...f.positions_worked, emptyPosition()] }));

  const updatePosition = (idx: number, field: keyof PositionWorked, value: string) =>
    setForm((f) => {
      const positions_worked = f.positions_worked.map((p, i) =>
        i === idx ? { ...p, [field]: field === "cv_count" ? Number(value) || 0 : value } : p,
      );
      return { ...f, positions_worked };
    });

  const removePosition = (idx: number) =>
    setForm((f) => ({
      ...f,
      positions_worked: f.positions_worked.filter((_, i) => i !== idx),
    }));

  const save = useMutation({
    mutationFn: async () => {
      if (!form.recruiter_name) throw new Error("Select a recruiter");
      if (!form.date) throw new Error("Select a date");

      const validPositions = form.positions_worked.filter(
        (p) => p.position_name.trim() || p.client_name.trim(),
      );

      const payload = {
        date: form.date,
        recruiter_name: form.recruiter_name,
        remarks: form.remarks.trim() === "" ? null : form.remarks.trim(),
        notes: null, // clear old notes field when updating
        positions_worked: validPositions.length > 0 ? validPositions : null,
        ...numericFields.reduce<Record<string, number>>((acc, f) => {
          acc[f.key] = Number(form[f.key]) || 0;
          return acc;
        }, {}),
      };

      if (editingId) {
        const { error } = await supabase.from("daily_reports").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("daily_reports").upsert(payload, { onConflict: "date,recruiter_name" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Report updated" : "Report saved");
      qc.invalidateQueries({ queryKey: ["daily_reports"] });
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Report deleted");
      qc.invalidateQueries({ queryKey: ["daily_reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (r: DailyReport) => {
    setEditingId(r.id);
    setForm({
      date: r.date,
      recruiter_name: r.recruiter_name,
      remarks: r.remarks ?? r.notes ?? "",
      positions_worked: r.positions_worked ?? [],
      cv_submitted: String(r.cv_submitted),
      interviews_scheduled: String(r.interviews_scheduled),
      joinings: String(r.joinings),
    });
    setDialogOpen(true);
  };

  const thisMonthReports = useMemo(() => {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    return reports.filter((r) => r.date >= monthStart);
  }, [reports]);

  const monthTotals = useMemo(() =>
    thisMonthReports.reduce(
      (acc, r) => ({
        cv: acc.cv + (Number(r.cv_submitted) || 0),
        interviews: acc.interviews + (Number(r.interviews_scheduled) || 0),
        joinings: acc.joinings + (Number(r.joinings) || 0),
      }),
      { cv: 0, interviews: 0, joinings: 0 },
    ), [thisMonthReports]);

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Daily Reporting</h1>
          <p className="text-sm text-muted-foreground">
            Log daily activity per recruiter. Same recruiter + date overwrites the existing record.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Report
        </Button>
      </div>

      {/* MTD summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "CVs this month", value: monthTotals.cv, color: "text-blue-600" },
          { label: "Interviews this month", value: monthTotals.interviews, color: "text-orange-600" },
          { label: "Joinings this month", value: monthTotals.joinings, color: "text-green-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
              <div className={`text-3xl font-semibold ${s.color}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Reports table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">All Reports</CardTitle>
          <span className="text-xs text-muted-foreground">{reports.length} entries</span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Recruiter</TableHead>
                  <TableHead className="text-center">CV Submitted</TableHead>
                  <TableHead className="text-center">Interviews Scheduled</TableHead>
                  <TableHead className="text-center">Joinings</TableHead>
                  <TableHead className="text-center">Positions</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-12">Loading…</TableCell>
                  </TableRow>
                ) : reports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-16">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <div className="text-4xl">📋</div>
                        <div className="text-sm font-medium">No reports yet</div>
                        <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
                          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add First Report
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  reports.map((r) => {
                    const posCount = r.positions_worked?.length ?? 0;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap font-medium">{r.date}</TableCell>
                        <TableCell>{r.recruiter_name}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={Number(r.cv_submitted) > 0 ? "default" : "secondary"} className="min-w-[2rem] justify-center">
                            {r.cv_submitted}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={Number(r.interviews_scheduled) > 0 ? "default" : "secondary"} className="min-w-[2rem] justify-center">
                            {r.interviews_scheduled}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={Number(r.joinings) > 0 ? "default" : "secondary"} className="min-w-[2rem] justify-center">
                            {r.joinings}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {posCount > 0 ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-xs"
                              onClick={() => setViewPositions({ report: r })}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span className="font-medium">{posCount}</span>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground text-xs">
                          {r.remarks ?? r.notes ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => startEdit(r)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete report?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete {r.recruiter_name}'s report for {r.date}.
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
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Report" : "Add Daily Report"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Date + Recruiter */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Recruiter</Label>
                <Select value={form.recruiter_name} onValueChange={(v) => setForm({ ...form, recruiter_name: v })}>
                  <SelectTrigger><SelectValue placeholder="Select recruiter" /></SelectTrigger>
                  <SelectContent>
                    {recruiters.map((r) => (
                      <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* MTD snapshot — Add mode only */}
            {recruiterMTD && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  {form.recruiter_name} — MTD this month
                </div>
                <div className="flex gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-semibold text-blue-600">{recruiterMTD.cv}</div>
                    <div className="text-[11px] text-muted-foreground">CVs</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-semibold text-orange-600">{recruiterMTD.interviews}</div>
                    <div className="text-[11px] text-muted-foreground">Interviews</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-semibold text-green-600">{recruiterMTD.joinings}</div>
                    <div className="text-[11px] text-muted-foreground">Joinings</div>
                  </div>
                </div>
              </div>
            )}

            {/* Numeric KPIs */}
            <div className="grid grid-cols-3 gap-3">
              {numericFields.map((f) => (
                <div key={f.key} className="space-y-2">
                  <Label>{f.label}</Label>
                  <Input
                    type="number" min="0"
                    value={form[f.key]}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  />
                </div>
              ))}
            </div>

            {/* Positions worked on */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Positions Worked On</Label>
                <Button type="button" variant="outline" size="sm" onClick={addPosition}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Position
                </Button>
              </div>

              {form.positions_worked.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No positions added yet. Click "Add Position" to add one.
                </div>
              ) : (
                <div className="space-y-2">
                  {form.positions_worked.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2 rounded-lg border bg-muted/20 p-3">
                      <div className="grid grid-cols-3 gap-2 flex-1">
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-1">Position Name</div>
                          <Input
                            placeholder="e.g. Inside Sales"
                            value={p.position_name}
                            onChange={(e) => updatePosition(idx, "position_name", e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-1">Client Name</div>
                          <Input
                            placeholder="e.g. Hema Automation"
                            value={p.client_name}
                            onChange={(e) => updatePosition(idx, "client_name", e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground mb-1">CVs Submitted</div>
                          <Input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={p.cv_count || ""}
                            onChange={(e) => updatePosition(idx, "cv_count", e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                      <Button
                        type="button" variant="ghost" size="sm"
                        className="text-destructive hover:text-destructive shrink-0"
                        onClick={() => removePosition(idx)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Remarks */}
            <div className="space-y-2">
              <Label>Remarks <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                rows={2}
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                placeholder="Any additional notes for this day…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : editingId ? "Update Report" : "Save Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Positions Dialog */}
      <Dialog open={!!viewPositions} onOpenChange={(o) => { if (!o) setViewPositions(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Positions Worked On
            </DialogTitle>
            {viewPositions && (
              <p className="text-xs text-muted-foreground">
                {viewPositions.report.recruiter_name} · {viewPositions.report.date}
              </p>
            )}
          </DialogHeader>
          <div className="space-y-2 py-1">
            {viewPositions?.report.positions_worked?.length ? (
              viewPositions.report.positions_worked.map((p, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg border bg-muted/20 px-3 py-2.5">
                  <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{p.position_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{p.client_name || "—"}</div>
                  </div>
                  {p.cv_count > 0 && (
                    <div className="text-right shrink-0">
                      <div className="text-lg font-semibold text-blue-600">{p.cv_count}</div>
                      <div className="text-[10px] text-muted-foreground">CVs</div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No positions recorded.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
