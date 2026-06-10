import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  supabase,
  type DailyReport,
  type MonthlyTarget,
  type MonthSetting,
  type Recruiter,
} from "@/lib/supabase";

export const Route = createFileRoute("/recruiter/$id")({
  head: () => ({ meta: [{ title: "Recruiter Details — TalentFlow" }] }),
  component: RecruiterDetailsPage,
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const now = new Date();
const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i);

const KPI_ROWS = [
  { label: "Calls / Connects Made", actual: "calls_made", target: "calls_target" },
  { label: "CV Submitted", actual: "cv_submitted", target: "submissions_target" },
  { label: "Interviews Scheduled", actual: "interviews_scheduled", target: "interviews_scheduled_target" },
  { label: "Joinings", actual: "joinings", target: "joinings_target" },
] as const;

function RecruiterDetailsPage() {
  const { id } = Route.useParams();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  const { data: recruiter } = useQuery({
    queryKey: ["recruiter", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recruiters")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Recruiter | null;
    },
  });

  const { data: reports = [] } = useQuery({
    queryKey: ["daily_reports", "recruiter", recruiter?.name, year, month],
    enabled: !!recruiter?.name,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_reports")
        .select("*")
        .eq("recruiter_name", recruiter!.name)
        .gte("date", monthStart)
        .lt("date", monthEnd)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DailyReport[];
    },
  });

  const { data: target } = useQuery({
    queryKey: ["monthly_targets", "single", recruiter?.name, month, year],
    enabled: !!recruiter?.name,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_targets")
        .select("*")
        .eq("recruiter_name", recruiter!.name)
        .eq("month", month)
        .eq("year", year)
        .maybeSingle();
      if (error) throw error;
      return data as MonthlyTarget | null;
    },
  });

  const { data: setting } = useQuery({
    queryKey: ["month_settings", "single", month, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("month_settings")
        .select("*")
        .eq("month", month)
        .eq("year", year)
        .maybeSingle();
      if (error) throw error;
      return data as MonthSetting | null;
    },
  });

  const workingDays = setting?.working_days ?? 0;

  const mtd = useMemo(() => {
    const t: Record<string, number> = {};
    for (const r of reports) {
      for (const k of KPI_ROWS) {
        t[k.actual] = (t[k.actual] ?? 0) + (Number(r[k.actual as keyof DailyReport]) || 0);
      }
    }
    return t;
  }, [reports]);

  const trendData = reports.map((r) => ({
    date: r.date.slice(5),
    cv: r.cv_submitted,
    interviews: r.interviews_scheduled,
    calls: r.calls_made,
  }));

  return (
    <div className="space-y-6">
      <Link to="/recruiters" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Recruiters
      </Link>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {recruiter?.name ?? "Recruiter"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {recruiter?.designation} · {recruiter?.years_of_experience} yrs ·{" "}
            {recruiter?.active ? (
              <Badge>Active</Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
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
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            KPI Performance — {MONTHS[month - 1]} {year}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Working days: <span className="text-foreground">{workingDays}</span>
            {!target && " · No target set for this month"}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>KPI</TableHead>
                  <TableHead className="text-right">Monthly Target</TableHead>
                  <TableHead className="text-right">Daily Pace</TableHead>
                  <TableHead className="text-right">MTD Actual</TableHead>
                  <TableHead className="w-[30%]">Attainment %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {KPI_ROWS.map((row) => {
                  const tgt = row.target && target
                    ? Number((target as unknown as Record<string, number>)[row.target]) || 0
                    : 0;
                  const act = mtd[row.actual] || 0;
                  const pace = tgt > 0 && workingDays > 0 ? (tgt / workingDays).toFixed(1) : "—";
                  const pct = tgt > 0 ? Math.round((act / tgt) * 100) : 0;
                  return (
                    <TableRow key={row.label}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.target ? tgt : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{pace}</TableCell>
                      <TableCell className="text-right tabular-nums">{act}</TableCell>
                      <TableCell>
                        {row.target ? (
                          <div className="flex items-center gap-3">
                            <Progress value={Math.min(pct, 100)} className="h-2 flex-1" />
                            <Badge variant={pct >= 100 ? "default" : "secondary"} className="w-14 justify-center">
                              {pct}%
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">n/a</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Monthly Trend</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72">
            {trendData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No reports this month.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  <Legend />
                  <Line type="monotone" dataKey="cv" stroke="#6366f1" strokeWidth={2} name="CV" />
                  <Line type="monotone" dataKey="interviews" stroke="#10b981" strokeWidth={2} name="Interviews" />
                  <Line type="monotone" dataKey="calls" stroke="#f59e0b" strokeWidth={2} name="Calls" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Daily Activity</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">CV</TableHead>
                  <TableHead className="text-right">Int. Sched.</TableHead>
                  <TableHead className="text-right">Joinings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No daily activity.
                    </TableCell>
                  </TableRow>
                ) : (
                  reports.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.date}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.calls_made}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.cv_submitted}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.interviews_scheduled}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.joinings}</TableCell>
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
