import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, Users, ArrowLeft, ExternalLink, FileText, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase, type JobApplication } from "@/lib/supabase";

export const Route = createFileRoute("/job-applications")({
  head: () => ({ meta: [{ title: "Applications — Kaapro" }] }),
  component: JobApplicationsPage,
});

const STATUS_COLORS: Record<string, string> = {
  new:        "bg-blue-100 text-blue-700",
  reviewing:  "bg-amber-100 text-amber-700",
  shortlisted:"bg-indigo-100 text-indigo-700",
  interview:  "bg-purple-100 text-purple-700",
  selected:   "bg-green-100 text-green-700",
  rejected:   "bg-red-100 text-red-700",
};

const STATUSES = ["new", "reviewing", "shortlisted", "interview", "selected", "rejected"];

type PositionWithApps = {
  id: string;
  position_name: string;
  client_name: string;
  location: string | null;
  ctc: string | null;
  applications: (JobApplication)[];
};

function JobApplicationsPage() {
  const qc = useQueryClient();
  const [selectedPosition, setSelectedPosition] = useState<PositionWithApps | null>(null);
  const [search, setSearch] = useState("");

  // Fetch posted positions with their application counts
  const { data: positions = [], isLoading } = useQuery({
    queryKey: ["job_applications_positions"],
    queryFn: async () => {
      const { data: pos } = await supabase
        .from("positions")
        .select("id, position_name, client_name, location, ctc, is_posted")
        .order("created_at", { ascending: false });

      const { data: apps } = await supabase
        .from("job_applications")
        .select("*")
        .order("created_at", { ascending: false });

      const appsByPosition: Record<string, JobApplication[]> = {};
      for (const app of (apps ?? [])) {
        const key = app.position_id ?? "unknown";
        if (!appsByPosition[key]) appsByPosition[key] = [];
        appsByPosition[key].push(app as JobApplication);
      }

      return (pos ?? [])
        .filter(p => (p as any).is_posted === true)
        .map(p => ({
          ...p,
          applications: appsByPosition[p.id] ?? [],
        })) as PositionWithApps[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("job_applications").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job_applications_positions"] });
    },
    onError: () => toast.error("Failed to update status"),
  });

  const downloadAllCVs = (apps: JobApplication[], positionName: string) => {
    const withCVs = apps.filter(a => a.cv_url);
    if (withCVs.length === 0) {
      toast.error("No CVs available for this position");
      return;
    }
    withCVs.forEach((app, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = app.cv_url!;
        a.target = "_blank";
        a.download = `${app.full_name.replace(/\s+/g, "_")}_CV.pdf`;
        a.click();
      }, i * 500);
    });
    toast.success(`Opening ${withCVs.length} CV${withCVs.length > 1 ? "s" : ""}...`);
  };

  const filteredApps = selectedPosition?.applications.filter(a =>
    search === "" ||
    a.full_name.toLowerCase().includes(search.toLowerCase()) ||
    a.email.toLowerCase().includes(search.toLowerCase()) ||
    (a.current_company ?? "").toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const totalApplications = positions.reduce((sum, p) => sum + p.applications.length, 0);

  // Position Detail View
  if (selectedPosition) {
    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedPosition(null); setSearch(""); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[#111827]">{selectedPosition.position_name}</h1>
              <span className="text-[#9ca3af]">·</span>
              <span className="text-[#6b7280]">{selectedPosition.client_name}</span>
            </div>
            <p className="text-sm text-[#9ca3af] mt-0.5">
              {selectedPosition.applications.length} application{selectedPosition.applications.length !== 1 ? "s" : ""}
              {selectedPosition.location ? ` · ${selectedPosition.location}` : ""}
              {selectedPosition.ctc ? ` · ${selectedPosition.ctc} LPA` : ""}
            </p>
          </div>
          <Button variant="outline" onClick={() => downloadAllCVs(selectedPosition.applications, selectedPosition.position_name)}>
            <Download className="h-4 w-4 mr-2" /> Download All CVs
          </Button>
        </div>

        {/* Search */}
        <Input
          placeholder="Search by name, email, company…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm"
        />

        {/* Applications list */}
        {filteredApps.length === 0 ? (
          <div className="text-center py-16 text-[#9ca3af]">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <div className="font-medium text-[#374151]">No applications yet</div>
            <div className="text-sm mt-1">Share the apply link on LinkedIn to get applicants</div>
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredApps.map(app => (
              <div key={app.id} className="bg-white border border-[#e5e7eb] rounded-xl p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: candidate info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-full bg-[#6366f1] flex items-center justify-center text-white text-[12px] font-bold shrink-0">
                        {app.full_name[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-[#111827]">{app.full_name}</div>
                        <div className="text-xs text-[#9ca3af]">{new Date(app.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-3 text-sm">
                      <div className="flex items-center gap-1.5 text-[#6b7280]">
                        <span className="text-xs">📧</span>
                        <a href={`mailto:${app.email}`} className="hover:text-[#6366f1] truncate">{app.email}</a>
                      </div>
                      <div className="flex items-center gap-1.5 text-[#6b7280]">
                        <span className="text-xs">📞</span>
                        <a href={`tel:${app.phone}`} className="hover:text-[#6366f1]">{app.phone}</a>
                      </div>
                      {app.current_company && (
                        <div className="flex items-center gap-1.5 text-[#6b7280]">
                          <span className="text-xs">🏢</span>
                          <span>{app.current_company}</span>
                        </div>
                      )}
                      {app.notice_period && (
                        <div className="flex items-center gap-1.5 text-[#6b7280]">
                          <span className="text-xs">📅</span>
                          <span>Notice: {app.notice_period}</span>
                        </div>
                      )}
                      {app.current_ctc && (
                        <div className="flex items-center gap-1.5 text-[#6b7280]">
                          <span className="text-xs">💰</span>
                          <span>Current: {app.current_ctc}</span>
                        </div>
                      )}
                      {app.expected_ctc && (
                        <div className="flex items-center gap-1.5 text-[#6b7280]">
                          <span className="text-xs">🎯</span>
                          <span>Expected: {app.expected_ctc}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Select
                      value={app.status}
                      onValueChange={v => updateStatus.mutate({ id: app.id, status: v })}
                    >
                      <SelectTrigger className={`w-36 h-7 text-xs font-semibold border-0 ${STATUS_COLORS[app.status] ?? "bg-gray-100 text-gray-600"}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map(s => (
                          <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex gap-2">
                      {app.linkedin_url && (
                        <a href={app.linkedin_url} target="_blank" rel="noreferrer"
                          className="text-xs text-[#6366f1] flex items-center gap-1 hover:underline">
                          <ExternalLink className="h-3 w-3" /> LinkedIn
                        </a>
                      )}
                      {app.cv_url && (
                        <a href={app.cv_url} target="_blank" rel="noreferrer"
                          className="text-xs text-[#16a34a] flex items-center gap-1 hover:underline">
                          <FileText className="h-3 w-3" /> View CV
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Positions Grid View
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#111827]">Applications</h1>
        <p className="text-sm text-[#6b7280] mt-0.5">
          Candidates who applied via apply.kaapro.in
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-4">
          <div className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1">Live Positions</div>
          <div className="text-3xl font-bold text-[#111827]">{positions.length}</div>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-4">
          <div className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1">Total Applications</div>
          <div className="text-3xl font-bold text-[#6366f1]">{totalApplications}</div>
        </div>
        <div className="bg-white border border-[#e5e7eb] rounded-xl p-4">
          <div className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1">New (Unreviewed)</div>
          <div className="text-3xl font-bold text-[#f59e0b]">
            {positions.reduce((sum, p) => sum + p.applications.filter(a => a.status === "new").length, 0)}
          </div>
        </div>
      </div>

      {/* Positions Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-[#9ca3af]">Loading…</div>
      ) : positions.length === 0 ? (
        <div className="text-center py-20 text-[#9ca3af]">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <div className="font-medium text-[#374151]">No live positions yet</div>
          <div className="text-sm mt-1">Go to Positions and click "Post" to publish jobs to apply.kaapro.in</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {positions.map(p => {
            const total = p.applications.length;
            const newCount = p.applications.filter(a => a.status === "new").length;
            const shortlisted = p.applications.filter(a => a.status === "shortlisted").length;
            const withCVs = p.applications.filter(a => a.cv_url).length;

            return (
              <div key={p.id} className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                {/* Card header */}
                <div className="p-4 border-b border-[#f3f4f6]">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[#111827] truncate">{p.position_name}</div>
                      <div className="text-sm text-[#6b7280] mt-0.5">{p.client_name}</div>
                      <div className="flex gap-2 mt-1.5 text-xs text-[#9ca3af]">
                        {p.location && <span>📍 {p.location}</span>}
                        {p.ctc && <span>💰 {p.ctc} LPA</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <div className="text-3xl font-black text-[#6366f1]">{total}</div>
                      <div className="text-[11px] text-[#9ca3af]">applicants</div>
                    </div>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 divide-x divide-[#f3f4f6] px-0">
                  <div className="p-3 text-center">
                    <div className="text-lg font-bold text-[#f59e0b]">{newCount}</div>
                    <div className="text-[10px] text-[#9ca3af]">New</div>
                  </div>
                  <div className="p-3 text-center">
                    <div className="text-lg font-bold text-[#6366f1]">{shortlisted}</div>
                    <div className="text-[10px] text-[#9ca3af]">Shortlisted</div>
                  </div>
                  <div className="p-3 text-center">
                    <div className="text-lg font-bold text-[#16a34a]">{withCVs}</div>
                    <div className="text-[10px] text-[#9ca3af]">CVs</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 p-3 pt-0">
                  <Button
                    className="flex-1 h-8 text-xs"
                    onClick={() => setSelectedPosition(p)}
                    disabled={total === 0}
                  >
                    <Users className="h-3.5 w-3.5 mr-1.5" />
                    {total === 0 ? "No applications yet" : `View ${total} Application${total !== 1 ? "s" : ""}`}
                  </Button>
                  {withCVs > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5"
                      onClick={() => downloadAllCVs(p.applications, p.position_name)}
                      title="Download all CVs"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
