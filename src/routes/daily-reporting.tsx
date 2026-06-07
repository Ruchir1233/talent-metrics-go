import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
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
import { supabase, type Recruiter } from "@/lib/supabase";

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

      // Upsert on (date, recruiter_name) — update if exists, insert otherwise.
      const { error } = await supabase
        .from("daily_reports")
        .upsert(payload, { onConflict: "date,recruiter_name" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Report saved");
      qc.invalidateQueries({ queryKey: ["daily_reports"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Daily Reporting</h1>
        <p className="text-sm text-muted-foreground">
          Log daily activity. Re-submitting for the same recruiter and date updates the existing record.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New / Update Report</CardTitle>
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
            <Button variant="ghost" onClick={() => setForm(emptyForm())}>
              Reset
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save Report"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
