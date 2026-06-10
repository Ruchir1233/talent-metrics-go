import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { RecruiterCombobox } from "@/components/RecruiterCombobox";
import {
  supabase,
  type MonthSetting,
  type MonthlyTarget,
  type Recruiter,
} from "@/lib/supabase";

export const Route = createFileRoute("/targets-setup")({
  head: () => ({ meta: [{ title: "Targets & Setup — TalentFlow" }] }),
  component: TargetsSetupPage,
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const now = new Date();
const currentMonth = now.getMonth() + 1;
const currentYear = now.getFullYear();
const years = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

const targetFields = [
  { key: "calls_target", label: "Calls Target" },
  { key: "submissions_target", label: "CV Submitted Target" },
  { key: "interviews_scheduled_target", label: "Interviews Scheduled Target" },
  { key: "offers_target", label: "Offers Target" },
  { key: "joinings_target", label: "Joinings Target" },
] as const;

type TKey = (typeof targetFields)[number]["key"];

function TargetsSetupPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);

  const { data: settings = [] } = useQuery({
    queryKey: ["month_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("month_settings")
        .select("*")
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MonthSetting[];
    },
  });

  const { data: targets = [] } = useQuery({
    queryKey: ["monthly_targets", month, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_targets")
        .select("*")
        .eq("month", month)
        .eq("year", year);
      if (error) throw error;
      return (data ?? []) as MonthlyTarget[];
    },
  });

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

  const activeNames = useMemo(() => recruiters.map((r) => r.name), [recruiters]);

  const currentSetting = useMemo(
    () => settings.find((s) => s.month === month && s.year === year),
    [settings, month, year],
  );
  const workingDays = currentSetting?.working_days ?? 0;

  // Month settings form
  const [msOpen, setMsOpen] = useState(false);
  const [msEditing, setMsEditing] = useState<MonthSetting | null>(null);
  const [msForm, setMsForm] = useState({ month: currentMonth, year: currentYear, working_days: 22 });

  const saveSetting = useMutation({
    mutationFn: async () => {
      const payload = {
        month: Number(msForm.month),
        year: Number(msForm.year),
        working_days: Number(msForm.working_days) || 0,
      };
      if (msEditing) {
        const { error } = await supabase
          .from("month_settings")
          .update(payload)
          .eq("id", msEditing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("month_settings")
          .upsert(payload, { onConflict: "month,year" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Month setup saved");
      qc.invalidateQueries({ queryKey: ["month_settings"] });
      setMsOpen(false);
      setMsEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteSetting = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("month_settings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Month setup removed");
      qc.invalidateQueries({ queryKey: ["month_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Target form
  const [tOpen, setTOpen] = useState(false);
  const [tEditing, setTEditing] = useState<MonthlyTarget | null>(null);
  const emptyTarget = {
    recruiter_name: "",
    calls_target: "0",
    submissions_target: "0",
    interviews_scheduled_target: "0",
    offers_target: "0",
    joinings_target: "0",
  };
  const [tForm, setTForm] = useState<Record<string, string>>(emptyTarget);

  const saveTarget = useMutation({
    mutationFn: async () => {
      if (!tForm.recruiter_name) throw new Error("Select a recruiter");
      const payload = {
        recruiter_name: tForm.recruiter_name,
        month,
        year,
        ...targetFields.reduce<Record<string, number>>((acc, f) => {
          acc[f.key] = Number(tForm[f.key]) || 0;
          return acc;
        }, {}),
      };
      if (tEditing) {
        const { error } = await supabase
          .from("monthly_targets")
          .update(payload)
          .eq("id", tEditing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("monthly_targets")
          .upsert(payload, { onConflict: "recruiter_name,month,year" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Target saved");
      qc.invalidateQueries({ queryKey: ["monthly_targets"] });
      setTOpen(false);
      setTEditing(null);
      setTForm(emptyTarget);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTarget = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("monthly_targets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Target removed");
      qc.invalidateQueries({ queryKey: ["monthly_targets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openAddTarget = () => {
    setTEditing(null);
    setTForm(emptyTarget);
    setTOpen(true);
  };

  const openEditTarget = (t: MonthlyTarget) => {
    setTEditing(t);
    setTForm({
      recruiter_name: t.recruiter_name,
      calls_target: String(t.calls_target),
      submissions_target: String(t.submissions_target),
      interviews_scheduled_target: String(t.interviews_scheduled_target),
      offers_target: String(t.offers_target),
      joinings_target: String(t.joinings_target),
    });
    setTOpen(true);
  };

  const pace = (n: number) =>
    workingDays > 0 ? (n / workingDays).toFixed(1) : "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Targets & Setup</h1>
        <p className="text-sm text-muted-foreground">
          Configure working days and monthly recruiter targets.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Month Setup</CardTitle>
          <Dialog open={msOpen} onOpenChange={setMsOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                onClick={() => {
                  setMsEditing(null);
                  setMsForm({ month: currentMonth, year: currentYear, working_days: 22 });
                }}
              >
                <Plus className="h-4 w-4 mr-2" /> Add Month
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{msEditing ? "Edit Month" : "Add Month"}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-2">
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Select
                    value={String(msForm.month)}
                    onValueChange={(v) => setMsForm({ ...msForm, month: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Select
                    value={String(msForm.year)}
                    onValueChange={(v) => setMsForm({ ...msForm, year: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Working Days</Label>
                  <Input
                    type="number"
                    min="0"
                    value={msForm.working_days}
                    onChange={(e) =>
                      setMsForm({ ...msForm, working_days: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setMsOpen(false)}>Cancel</Button>
                <Button onClick={() => saveSetting.mutate()} disabled={saveSetting.isPending}>
                  {saveSetting.isPending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Working Days</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No month setup yet.
                  </TableCell>
                </TableRow>
              ) : (
                settings.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{MONTHS[s.month - 1]}</TableCell>
                    <TableCell>{s.year}</TableCell>
                    <TableCell>{s.working_days}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setMsEditing(s);
                          setMsForm({ month: s.month, year: s.year, working_days: s.working_days });
                          setMsOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteSetting.mutate(s.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">Recruiter Targets</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Working days for {MONTHS[month - 1]} {year}:{" "}
              <span className="text-foreground font-medium">{workingDays}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={tOpen} onOpenChange={setTOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={openAddTarget}>
                  <Plus className="h-4 w-4 mr-2" /> Add Target
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {tEditing ? "Edit Target" : "Add Target"} — {MONTHS[month - 1]} {year}
                  </DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Recruiter</Label>
                    <RecruiterCombobox
                      value={tForm.recruiter_name}
                      onChange={(v) => setTForm({ ...tForm, recruiter_name: v })}
                      options={activeNames}
                    />
                  </div>
                  {targetFields.map((f) => (
                    <div key={f.key} className="space-y-2">
                      <Label>
                        {f.label}
                        <span className="ml-2 text-xs text-muted-foreground">
                          Daily pace: {pace(Number(tForm[f.key]) || 0)}
                        </span>
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        value={tForm[f.key]}
                        onChange={(e) => setTForm({ ...tForm, [f.key]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setTOpen(false)}>Cancel</Button>
                  <Button onClick={() => saveTarget.mutate()} disabled={saveTarget.isPending}>
                    {saveTarget.isPending ? "Saving…" : "Save Target"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recruiter</TableHead>
                  {targetFields.map((f) => (
                    <TableHead key={f.key} className="whitespace-nowrap text-right">
                      {f.label.replace(" Target", "")}
                      <div className="text-[10px] font-normal text-muted-foreground">
                        Daily pace
                      </div>
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {targets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={targetFields.length + 2} className="text-center text-muted-foreground py-8">
                      No targets for {MONTHS[month - 1]} {year}.
                    </TableCell>
                  </TableRow>
                ) : (
                  targets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.recruiter_name}</TableCell>
                      {targetFields.map((f) => {
                        const val = (t as unknown as Record<TKey, number>)[f.key];
                        return (
                          <TableCell key={f.key} className="text-right tabular-nums">
                            {val}
                            <div className="text-[10px] text-muted-foreground">
                              {pace(val)}/day
                            </div>
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEditTarget(t)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteTarget.mutate(t.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
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
