import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
} from "@/lib/supabase";

export const Route = createFileRoute("/team-summary")({
  head: () => ({ meta: [{ title: "Team Summary — TalentFlow" }] }),
  component: TeamSummaryPage,
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const now = new Date();
const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i);

const KPI_ROWS = [
  { label: "CV Submitted", actual: "cv_submitted", target: "submissions_target" },
  { label: "Interviews Scheduled", actual: "interviews_scheduled", target: "interviews_scheduled_target" },
  { label: "Joinings", actual: "joinings", target: "joinings_target" },
] as const;

const COLOR_CV = "#6366f1";
const COLOR_INTERVIEWS = "#10b981";
const PIE_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ec4899",
  "#06b6d4", "#f97316", "#8b5cf6", "#84cc16",
];

function TeamSummaryPage() {
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "cv_submitted", desc: true }]);

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  const { data: reports = [] } = useQuery({
    queryKey: ["daily_reports", "month", year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_reports")
        .select("*")
        .gte("date", monthStart)
        .lt("date", monthEnd)
        .order("date");
      if (error) throw error;
      return (data ?? []) as DailyReport[];
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

  // Team totals
  const teamTotals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const r of reports) {
      for (const row of KPI_ROWS) {
        t[row.actual] = (t[row.actual] ?? 0) + (Number(r[row.actual as keyof DailyReport]) || 0);
      }
    }
    for (const row of KPI_ROWS) {
      t[row.target] = targets.reduce(
        (s, x) => s + (Number(x[row.target as keyof MonthlyTarget]) || 0),
        0,
      );
    }
    return t;
  }, [reports, targets]);

  // Per recruiter scorecard with target lookup
  const recruiterRows = useMemo(() => {
    const map = new Map<string, Record<string, number | string>>();
    for (const r of reports) {
      let row = map.get(r.recruiter_name);
      if (!row) {
        row = { recruiter: r.recruiter_name };
        for (const k of KPI_ROWS) row[k.actual] = 0;
        map.set(r.recruiter_name, row);
      }
      for (const k of KPI_ROWS) {
        row[k.actual] = (row[k.actual] as number) + (Number(r[k.actual as keyof DailyReport]) || 0);
      }
    }
    // Attach individual targets
    return Array.from(map.values()).map((row) => {
      const target = targets.find((t) => t.recruiter_name === row.recruiter);
      return {
        ...row,
        submissions_target: target?.submissions_target ?? 0,
        interviews_target: target?.interviews_scheduled_target ?? 0,
        joinings_target: target?.joinings_target ?? 0,
      };
    });
  }, [reports, targets]);

  const teamTotalRow = useMemo(() => {
    const r: Record<string, number | string> = { recruiter: "Team Total" };
    for (const k of KPI_ROWS) {
      r[k.actual] = recruiterRows.reduce((s, x) => s + (Number(x[k.actual]) || 0), 0);
    }
    return r;
  }, [recruiterRows]);

  // Team trend by date
  const trendData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const r of reports) {
      let d = byDate.get(r.date);
      if (!d) {
        d = { date: r.date.slice(5), cv: 0, interviews: 0 };
        byDate.set(r.date, d);
      }
      d.cv = (d.cv as number) + (Number(r.cv_submitted) || 0);
      d.interviews = (d.interviews as number) + (Number(r.interviews_scheduled) || 0);
    }
    return Array.from(byDate.values()).sort((a, b) =>
      (a.date as string).localeCompare(b.date as string),
    );
  }, [reports]);

  const contributionData = useMemo(
    () =>
      recruiterRows
        .map((r) => ({ name: r.recruiter as string, value: Number(r.cv_submitted) || 0 }))
        .filter((d) => d.value > 0),
    [recruiterRows],
  );

  type RecruiterRow = Record<string, number | string>;

  const columns = useMemo<ColumnDef<RecruiterRow>[]>(
    () => [
      { accessorKey: "recruiter", header: "Recruiter" },
      {
        accessorKey: "cv_submitted",
        header: "CVs",
        cell: ({ getValue, row }) => {
          const actual = Number(getValue()) || 0;
          const target = Number(row.original.submissions_target) || 0;
          const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : null;
          return (
            <div className="flex items-center gap-2">
              <span className="tabular-nums font-medium">{actual}</span>
              {pct !== null && (
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${pct >= 80 ? "border-green-500/40 text-green-700" : pct >= 50 ? "border-amber-500/40 text-amber-700" : "border-red-500/40 text-red-700"}`}
                >
                  {pct}%
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "interviews_scheduled",
        header: "Interviews",
        cell: ({ getValue, row }) => {
          const actual = Number(getValue()) || 0;
          const target = Number(row.original.interviews_target) || 0;
          const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : null;
          return (
            <div className="flex items-center gap-2">
              <span className="tabular-nums font-medium">{actual}</span>
              {pct !== null && (
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${pct >= 80 ? "border-green-500/40 text-green-700" : pct >= 50 ? "border-amber-500/40 text-amber-700" : "border-red-500/40 text-red-700"}`}
                >
                  {pct}%
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "joinings",
        header: "Joinings",
        cell: ({ getValue, row }) => {
          const actual = Number(getValue()) || 0;
          const target = Number(row.original.joinings_target) || 0;
          const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : null;
          return (
            <div className="flex items-center gap-2">
              <span className="tabular-nums font-medium">{actual}</span>
              {pct !== null && (
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 ${pct >= 80 ? "border-green-500/40 text-green-700" : pct >= 50 ? "border-amber-500/40 text-amber-700" : "border-red-500/40 text-red-700"}`}
                >
                  {pct}%
                </Badge>
              )}
            </div>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: recruiterRows,
    columns,
    state: { sorting, globalFilter: search },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: "includesString",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team Summary</h1>
          <p className="text-sm text-muted-foreground">
            Team KPI roll-up and per-recruiter scorecards.
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
          <CardTitle className="text-base">Team KPI Roll-Up</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>KPI</TableHead>
                <TableHead className="text-right">Monthly Target</TableHead>
                <TableHead className="text-right">MTD Actual</TableHead>
                <TableHead className="w-[40%]">Achievement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {KPI_ROWS.map((row) => {
                const tgt = teamTotals[row.target] || 0;
                const act = teamTotals[row.actual] || 0;
                const pct = tgt > 0 ? Math.round((act / tgt) * 100) : 0;
                return (
                  <TableRow key={row.label}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{tgt}</TableCell>
                    <TableCell className="text-right tabular-nums">{act}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Progress value={Math.min(pct, 100)} className="h-2 flex-1" />
                        <span className={`text-xs tabular-nums w-12 text-right font-medium ${pct >= 80 ? "text-green-700" : pct >= 50 ? "text-amber-700" : tgt > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                          {tgt > 0 ? `${pct}%` : "—"}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Per Person Scorecard</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">% badges show achievement vs individual target</p>
          </div>
          <Input
            placeholder="Search recruiter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((h) => (
                      <TableHead key={h.id} className="whitespace-nowrap">
                        <button
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={h.column.getToggleSortingHandler()}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <ArrowUpDown className="h-3 w-3 opacity-60" />
                        </button>
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
                      No reports for {MONTHS[month - 1]} {year}.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold bg-muted/40">
                      <TableCell>{teamTotalRow.recruiter}</TableCell>
                      <TableCell>{teamTotalRow.cv_submitted}</TableCell>
                      <TableCell>{teamTotalRow.interviews_scheduled}</TableCell>
                      <TableCell>{teamTotalRow.joinings}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Team Daily Trend</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              {trendData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No data this month.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis fontSize={12} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <Legend />
                    <Line type="monotone" dataKey="cv" stroke={COLOR_CV} strokeWidth={2} name="CV" dot={false} />
                    <Line type="monotone" dataKey="interviews" stroke={COLOR_INTERVIEWS} strokeWidth={2} name="Interviews" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recruiter Comparison (CV)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              {recruiterRows.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No data.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={recruiterRows}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="recruiter" fontSize={12} />
                    <YAxis fontSize={12} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <Bar dataKey="cv_submitted" fill={COLOR_CV} radius={[6, 6, 0, 0]} name="CV" />
                    <Bar dataKey="interviews_scheduled" fill={COLOR_INTERVIEWS} radius={[6, 6, 0, 0]} name="Interviews" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Recruiter Contribution (CV)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-80">
              {contributionData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No data.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={contributionData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={110}
                      label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                    >
                      {contributionData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
