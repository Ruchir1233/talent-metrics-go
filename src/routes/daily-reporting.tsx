import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { supabase, type Recruiter, type DailyReport } from "@/lib/supabase";

export const Route = createFileRoute("/daily-reporting")({
  head: () => ({ meta: [{ title: "Daily Reporting — TalentFlow" }] }),
  component: DailyReporting,
});

const numericFields = [
  { key: "calls_made", label: "Calls Made" },
  { key: "cv_submitted", label: "CV Submitted" },
  { key: "interviews_scheduled", label: "Interviews Scheduled" },
  { key: "interviews_attended", label: "Interviews Attended" },
  { key: "interview_no_shows", label: "Interview No Shows" },
  { key: "selections", label: "Selections" },
  { key: "offers_released", label: "Offers Released" },
  { key: "offer_drops", label: "Offer Drops" },
  { key: "joinings", label: "Joinings" },
] as const;

type NumKey = (typeof numericFields)[number]["key"];

type FormState = {
  date: string;
  recruiter_name: string;
  notes: string;
} & Record<NumKey, string>;

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): FormState => ({
  date: today(),
  recruiter_name: "",
  notes: "",
  calls_made: "0",
  cv_submitted: "0",
  interviews_scheduled: "0",
  interviews_attended: "0",
  interview_no_shows: "0",
  selections: "0",
  offers_released: "0",
  offer_drops: "0",
  joinings: "0",
});

function DailyReporting() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: recruiters = [] } = useQuery({
    queryKey: ["recruiters", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recruiters")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Recruiter[];
    },
  });

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["daily_reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_reports")
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DailyReport[];
    },
  });

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.recruiter_name) throw new Error("Select a recruiter");
      if (!form.date) throw new Error("Select a date");

      const payload = {
        date: form.date,
        recruiter_name: form.recruiter_name,
        notes: form.notes || null,
        ...numericFields.reduce<Record<string, number>>((acc, f) => {
          acc[f.key] = Number(form[f.key]) || 0;
          return acc;
        }, {}),
      };

      if (editingId) {
        const { error } = await supabase
          .from("daily_reports")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("daily_reports")
          .upsert(payload, { onConflict: "date,recruiter_name" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Report updated" : "Report saved");
      qc.invalidateQueries({ queryKey: ["daily_reports"] });
      resetForm();
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
      notes: r.notes ?? "",
      calls_made: String(r.calls_made),
      cv_submitted: String(r.cv_submitted),
      interviews_scheduled: String(r.interviews_scheduled),
      interviews_attended: String(r.interviews_attended),
      interview_no_shows: String(r.interview_no_shows),
      selections: String(r.selections),
      offers_released: String(r.offers_released),
      offer_drops: String(r.offer_drops),
      joinings: String(r.joinings),
    });
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Daily Reporting</h1>
        <p className="text-sm text-muted-foreground">
          Log daily activity. Re-submitting for the same recruiter and date updates the existing record.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {editingId ? "Edit Report" : "New / Update Report"}
          </CardTitle>
          {editingId && (
            <Button variant="ghost" size="sm" onClick={resetForm}>
              <X className="h-4 w-4 mr-1" /> Cancel edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Recruiter Name</Label>
              <Select
                value={form.recruiter_name}
                onValueChange={(v) => setForm({ ...form, recruiter_name: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select active recruiter" />
                </SelectTrigger>
                <SelectContent>
                  {recruiters.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No active recruiters
                    </div>
                  ) : (
                    recruiters.map((r) => (
                      <SelectItem key={r.id} value={r.name}>
                        {r.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {numericFields.map((f) => (
              <div key={f.key} className="space-y-2">
                <Label>{f.label}</Label>
                <Input
                  type="number"
                  min="0"
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Anything worth remembering about today…"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={resetForm}>
              Reset
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : editingId ? "Update Report" : "Save Report"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Previous Reports</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Recruiter</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">CV</TableHead>
                  <TableHead className="text-right">Int. Sch.</TableHead>
                  <TableHead className="text-right">Int. Att.</TableHead>
                  <TableHead className="text-right">Sel.</TableHead>
                  <TableHead className="text-right">Off.</TableHead>
                  <TableHead className="text-right">Join.</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : reports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No reports yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  reports.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                      <TableCell className="font-medium">{r.recruiter_name}</TableCell>
                      <TableCell className="text-right">{r.calls_made}</TableCell>
                      <TableCell className="text-right">{r.cv_submitted}</TableCell>
                      <TableCell className="text-right">{r.interviews_scheduled}</TableCell>
                      <TableCell className="text-right">{r.interviews_attended}</TableCell>
                      <TableCell className="text-right">{r.selections}</TableCell>
                      <TableCell className="text-right">{r.offers_released}</TableCell>
                      <TableCell className="text-right">{r.joinings}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                              >
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
                                <AlertDialogAction onClick={() => del.mutate(r.id)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
