import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Phone,
  FileText,
  CalendarClock,
  Rocket,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase, type DailyReport } from "@/lib/supabase";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — TalentFlow" }] }),
  component: Dashboard,
});

const kpis = [
  { key: "calls_made", label: "Calls Made", icon: Phone },
  { key: "cv_submitted", label: "CV Submitted", icon: FileText },
  { key: "interviews_scheduled", label: "Interviews Scheduled", icon: CalendarClock },
  { key: "joinings", label: "Joinings", icon: Rocket },
] as const;

function Dashboard() {
  const { data: reports = [], isLoading, error } = useQuery({
    queryKey: ["daily_reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_reports")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DailyReport[];
    },
  });

  const totals = kpis.reduce<Record<string, number>>((acc, k) => {
    acc[k.key] = reports.reduce((s, r) => s + (Number(r[k.key as keyof DailyReport]) || 0), 0);
    return acc;
  }, {});

  const byRecruiter = Object.values(
    reports.reduce<Record<string, { recruiter: string; cv: number }>>((acc, r) => {
      if (!acc[r.recruiter_name]) acc[r.recruiter_name] = { recruiter: r.recruiter_name, cv: 0 };
      acc[r.recruiter_name].cv += Number(r.cv_submitted) || 0;
      return acc;
    }, {}),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of recruitment activity.</p>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">
            Couldn't load reports. Check your Supabase connection.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {kpis.map(({ key, label, icon: Icon }) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? "—" : totals[key].toLocaleString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">CV Submissions by Recruiter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            {byRecruiter.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No data yet. Add a daily report to see the chart.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byRecruiter}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="recruiter" stroke="currentColor" fontSize={12} />
                  <YAxis stroke="currentColor" fontSize={12} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Bar dataKey="cv" fill="#6366f1" radius={[6, 6, 0, 0]} name="CVs" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
