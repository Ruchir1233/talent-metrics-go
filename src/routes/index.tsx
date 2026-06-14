import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  FileText,
  CalendarCheck,
  CheckCircle2,
  Users,
  AlertTriangle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  supabase,
  type DailyReport,
  type Candidate,
  type MonthlyTarget,
  INACTIVE_STAGES,
} from "@/lib/supabase";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — TalentFlow" }] }),
  component: Dashboard,
});

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const now = new Date();
const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i);

const COLOR_CV = "#378ADD";
const COLOR_INT = "#EF9F27";
const COLOR_JOIN = "#639922";

function Dashboard() {
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  const { data: reports = [], error: reportsErr } = useQuery({
    queryKey: ["daily_reports", year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_reports")
        .select("*")
        .gte("date", monthStart)
        .lt("date", monthEnd)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DailyReport[];
    },
  });

  const { data: candidates = [] } = useQuery({
    queryKey: ["candidates", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("candidates").select("*");
      if (error) throw error;
      return (data ?? []) as Candidate[];
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

  const totals = useMemo(() => {
    return reports.reduce(
      (a, r) => ({
        cv: a.cv + (Number(r.cv_submitted) || 0),
        interviews: a.interviews + (Number(r.interviews_scheduled) || 0),
        joinings: a.joinings + (Number(r.joinings) || 0),
      }),
      { cv: 0, interviews: 0, joinings: 0 },
    );
  }, [reports]);

  const targetTotals = useMemo(() => {
    return targets.reduce(
      (a, t) => ({
        cv: a.cv + (Number(t.submissions_target) || 0),
        joinings: a.joinings + (Number(t.joinings_target) || 0),
      }),
      { cv: 0, joinings: 0 },
    );
  }, [targets]);

  const active = useMemo(
    () => candidates.filter((c) => !INACTIVE_STAGES.includes(c.stage as never)),
    [candidates],
  );
  const activePositions = useMemo(
    () => new Set(active.map((c) => `${c.client_name}|${c.position_name}`)).size,
    [active],
  );

  // Daily chart — last 7 days within selected month
  const dailyChart = useMemo(() => {
    const map = new Map<string, { date: string; cv: number; interviews: number }>();
    for (const r of reports) {
      const key = r.date;
      const cur = map.get(key) ?? { date: key.slice(5), cv: 0, interviews: 0 };
      cur.cv += Number(r.cv_submitted) || 0;
      cur.interviews += Number(r.interviews_scheduled) || 0;
      map.set(key, cur);
    }
    return Array.from(map.values()).slice(-7);
  }, [reports]);

  // Stage distribution across all active candidates
  const stageDist = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of active) counts[c.stage as string] = (counts[c.stage as string] ?? 0) + 1;
    const total = active.length || 1;
    const items = [
      { label: "Interview Scheduled", key: "Interview Scheduled", color: COLOR_INT },
      { label: "Submitted", key: "Submitted", color: COLOR_CV },
      { label: "Interview Attended", key: "Interview Attended", color: "#06b6d4" },
      { label: "Selected", key: "Selected", color: "#a855f7" },
      { label: "Offered", key: "Offered", color: COLOR_JOIN },
    ];
    return items.map((i) => ({
      ...i,
      count: counts[i.key] ?? 0,
      pct: Math.round(((counts[i.key] ?? 0) / total) * 100),
    }));
  }, [active]);

  // Position funnel — group by position
  const positionFunnel = useMemo(() => {
    const map = new Map<string, { name: string; cv: number; interviews: number; joined: number }>();
    for (const c of candidates) {
      const key = c.position_name;
      const cur = map.get(key) ?? { name: c.position_name, cv: 0, interviews: 0, joined: 0 };
      cur.cv += 1;
      if (["Interview Scheduled", "Interview Attended", "Selected", "Offered", "Joined"].includes(c.stage as string))
        cur.interviews += 1;
      if (c.stage === "Joined") cur.joined += 1;
      map.set(key, cur);
    }
    const arr = Array.from(map.values()).sort((a, b) => b.cv - a.cv).slice(0, 6);
    const max = Math.max(1, ...arr.map((a) => a.cv));
    return arr.map((a) => {
      const intRate = a.cv > 0 ? a.interviews / a.cv : 0;
      let tag = { label: "Monitor", cls: "bg-muted text-muted-foreground" };
      if (a.cv >= 2 && a.interviews === 0)
        tag = { label: "Stalled", cls: "bg-red-100 text-red-700" };
      else if (intRate >= 0.6)
        tag = { label: "Push to offer", cls: "bg-green-100 text-green-700" };
      else if (intRate >= 0.4)
        tag = { label: "Good conv.", cls: "bg-blue-100 text-blue-700" };
      else if (a.interviews > 0)
        tag = { label: "Follow up", cls: "bg-amber-100 text-amber-700" };
      return { ...a, max, tag };
    });
  }, [candidates]);

  // Actions due / overdue
  const actions = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    return active
      .filter((c) => c.next_action_date)
      .map((c) => {
        const d = new Date(c.next_action_date!); d.setHours(0, 0, 0, 0);
        let label = "Tomorrow", cls = "bg-muted text-muted-foreground", dot = "#888780";
        if (d < today) { label = "Overdue"; cls = "bg-red-100 text-red-700"; dot = COLOR_RED; }
        else if (d.getTime() === today.getTime()) { label = "Today"; cls = "bg-amber-100 text-amber-700"; dot = COLOR_INT; }
        else if (d.getTime() === tomorrow.getTime()) { label = "Tomorrow"; cls = "bg-muted text-muted-foreground"; dot = "#888780"; }
        return { c, label, cls, dot, when: d.getTime() };
      })
      .sort((a, b) => a.when - b.when)
      .slice(0, 6);
  }, [active]);

  // Upcoming interviews — candidates with interview_date set, sorted by date
  const upcomingInterviews = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return candidates
      .filter((c) => c.interview_date)
      .map((c) => {
        const d = new Date(c.interview_date!); d.setHours(0, 0, 0, 0);
        const diff = Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        let label = "";
        let cls = "bg-muted text-muted-foreground";
        if (diff < 0) { label = `${Math.abs(diff)}d ago`; cls = "bg-muted text-muted-foreground"; }
        else if (diff === 0) { label = "Today"; cls = "bg-orange-100 text-orange-700"; }
        else if (diff === 1) { label = "Tomorrow"; cls = "bg-amber-100 text-amber-700"; }
        else { label = `In ${diff}d`; cls = "bg-blue-100 text-blue-700"; }
        return { c, diff, label, cls };
      })
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 8);
  }, [candidates]);

  const intRate = totals.cv > 0 ? Math.round((totals.interviews / totals.cv) * 100) : 0;
  const joinRate = totals.cv > 0 ? Math.round((totals.joinings / totals.cv) * 100) : 0;
  const cvPct = targetTotals.cv > 0 ? Math.min(100, Math.round((totals.cv / targetTotals.cv) * 100)) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Performance tracker</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Overview · {MONTHS[month - 1]} {year}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-8 w-[90px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {reportsErr && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">
            Couldn't load reports.
          </CardContent>
        </Card>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<FileText className="h-3.5 w-3.5" />}
          label="CVs this month"
          value={totals.cv}
          sub={
            targetTotals.cv > 0
              ? `${cvPct}% of ${targetTotals.cv} target`
              : "Target not set"
          }
          subColor={targetTotals.cv === 0 ? "text-amber-700" : cvPct >= 80 ? "text-green-700" : "text-amber-700"}
        />
        <KpiCard
          icon={<CalendarCheck className="h-3.5 w-3.5" />}
          label="Interviews"
          value={totals.interviews}
          sub={totals.cv > 0 ? `${intRate}% of CVs` : "—"}
          subColor={intRate >= 30 ? "text-green-700" : "text-amber-700"}
        />
        <KpiCard
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Joinings"
          value={totals.joinings}
          sub={totals.cv > 0 ? `${joinRate}% close rate` : "—"}
          subColor={joinRate > 0 ? "text-green-700" : "text-red-700"}
        />
        <KpiCard
          icon={<Users className="h-3.5 w-3.5" />}
          label="Active pipeline"
          value={active.length}
          sub={`${activePositions} positions`}
          subColor="text-green-700"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Daily CV output */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Daily CV output — this month
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {MONTHS[month - 1].slice(0, 3)} {year}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[180px] w-full">
              {dailyChart.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  No data yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.25} vertical={false} />
                    <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="cv" fill={COLOR_CV} radius={[3, 3, 0, 0]} name="CVs submitted" />
                    <Bar dataKey="interviews" fill={COLOR_INT} radius={[3, 3, 0, 0]} name="Interviews" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            {dailyChart.some((d) => d.cv > 0 && d.interviews === 0) && (
              <div className="mt-3 px-3 py-2 rounded-md bg-amber-50 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-700 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Some days have CVs submitted but no interviews — chase client follow-ups.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Interview Schedule */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-orange-500" />
              Upcoming Interviews
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {upcomingInterviews.length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center">
                No interviews scheduled yet.<br />
                <span className="text-[11px]">Use the 📅 button in Candidate Pipeline to schedule one.</span>
              </div>
            ) : (
              upcomingInterviews.map(({ c, label, cls }) => (
                <div key={c.id} className="flex items-center gap-3 py-2.5 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{c.candidate_name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {c.position_name} · {c.client_name}
                    </div>
                    {c.interview_time && (
                      <div className="text-[11px] text-muted-foreground">
                        🕐 {c.interview_time}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {c.interview_date}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cls}`}>
                      {label}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Position funnel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Position funnel
              <span className="text-[11px] font-normal text-muted-foreground">CVs → Int → Joined</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="flex gap-3 mb-2 text-[11px] text-muted-foreground">
              <LegendDot color={COLOR_CV} label="CVs" />
              <LegendDot color={COLOR_INT} label="Interviews" />
              <LegendDot color={COLOR_JOIN} label="Joined" />
            </div>
            {positionFunnel.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No positions yet.</p>
            ) : (
              positionFunnel.map((p) => {
                const scale = 120 / p.max;
                return (
                  <div key={p.name} className="flex items-center gap-2 py-2 border-b last:border-0 text-xs">
                    <div className="w-28 truncate font-medium">{p.name}</div>
                    <div className="flex gap-0.5 flex-1">
                      <div className="h-2 rounded-sm" style={{ background: COLOR_CV, width: `${Math.max(4, p.cv * scale)}px` }} />
                      <div className="h-2 rounded-sm" style={{ background: COLOR_INT, width: `${Math.max(2, p.interviews * scale)}px` }} />
                      <div className="h-2 rounded-sm" style={{ background: COLOR_JOIN, width: `${Math.max(2, p.joined * scale)}px` }} />
                    </div>
                    <div className="w-14 text-right text-[11px] text-muted-foreground tabular-nums">
                      {p.cv}·{p.interviews}·{p.joined}
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${p.tag.cls}`}>
                      {p.tag.label}
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Actions due / overdue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {actions.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No upcoming actions.</p>
            ) : (
              actions.map(({ c, label, cls, dot }) => (
                <div key={c.id} className="flex items-center gap-2 py-2 border-b last:border-0">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{c.candidate_name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {c.position_name} · {c.client_name}
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${cls}`}>
                    {label}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon, label, value, sub, subColor,
}: { icon: React.ReactNode; label: string; value: number; sub: string; subColor: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-semibold leading-none">{value.toLocaleString()}</div>
        <div className={`text-[11px] mt-1.5 ${subColor}`}>{sub}</div>
      </CardContent>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}
