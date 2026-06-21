import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { GripVertical, Share2, ChevronDown, ChevronRight, LayoutList, Users } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { StageBadge } from "@/components/StageBadge";
import {
  supabase, type Candidate, type Position, type CandidateStage,
  INACTIVE_STAGES, CANDIDATE_STAGES,
} from "@/lib/supabase";

export const Route = createFileRoute("/position-summary")({
  head: () => ({ meta: [{ title: "Position Summary — Kaapro" }] }),
  component: PositionSummaryPage,
});

type PositionRow = Position & {
  total_cvs: number;
  interviews: number;
  joined: number;
  active_candidates: number;
  days_open: number;
};

type ClientGroup = {
  client_name: string;
  positions: PositionRow[];
  total_cvs: number;
  interviews: number;
  joined: number;
  active: number;
};

function PositionSummaryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  const [suratFilter, setSuratFilter] = useState<"all" | "surat">("all");
  const [collapsedClients, setCollapsedClients] = useState<Set<string>>(new Set());
  const [openPos, setOpenPos] = useState<PositionRow | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const { data: positions = [], isLoading } = useQuery({
    queryKey: ["positions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("positions").select("*").order("client_name");
      if (error) throw error;
      return (data ?? []) as Position[];
    },
  });

  const { data: candidates = [] } = useQuery({
    queryKey: ["candidates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("candidates").select("*");
      if (error) throw error;
      return (data ?? []) as Candidate[];
    },
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: CandidateStage }) => {
      const { error } = await supabase.from("candidates").update({ stage }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { stage }) => {
      toast.success(`Moved to "${stage}"`);
      qc.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const rows = useMemo<PositionRow[]>(() => {
    return positions.map((p) => {
      const positionCands = candidates.filter((c) =>
        c.position_id === p.id ||
        (c.client_name?.trim().toLowerCase() === p.client_name.trim().toLowerCase() &&
          c.position_name?.trim().toLowerCase() === p.position_name.trim().toLowerCase())
      );
      const total_cvs = positionCands.length + (p.surat_cv_count || 0);
      const active_candidates = positionCands.filter((c) => !(INACTIVE_STAGES as string[]).includes(c.stage)).length;
      const interviews = positionCands.filter((c) =>
        ["Interview Scheduled", "Interview Attended", "Selected", "Offered", "Joined"].includes(c.stage)
      ).length;
      const joined = positionCands.filter((c) => c.stage === "Joined").length;
      let days_open = 0;
      if (p.date_opened) {
        const opened = new Date(p.date_opened); opened.setHours(0, 0, 0, 0);
        days_open = Math.floor((today.getTime() - opened.getTime()) / (1000 * 60 * 60 * 24));
      }
      return { ...p, total_cvs, active_candidates, interviews, joined, days_open };
    });
  }, [positions, candidates, today]);

  const positionCandidates = useMemo(() => {
    if (!openPos) return [] as Candidate[];
    return candidates.filter((c) =>
      c.position_id === openPos.id ||
      (c.client_name?.trim().toLowerCase() === openPos.client_name.trim().toLowerCase() &&
        c.position_name?.trim().toLowerCase() === openPos.position_name.trim().toLowerCase())
    );
  }, [openPos, candidates]);

  const clientList = useMemo(() =>
    Array.from(new Set(positions.map((p) => p.client_name.trim()))).sort(), [positions]);

  // Group by client
  const clientGroups = useMemo<ClientGroup[]>(() => {
    const filtered = rows.filter((r) => {
      const matchSearch = search === "" ||
        r.client_name.toLowerCase().includes(search.toLowerCase()) ||
        r.position_name.toLowerCase().includes(search.toLowerCase());
      const matchClient = clientFilter === "all" || r.client_name.trim() === clientFilter;
      const matchSurat = suratFilter === "all" || r.shared_with_surat === true;
      return matchSearch && matchClient && matchSurat;
    });

    const map = new Map<string, PositionRow[]>();
    for (const r of filtered) {
      const key = r.client_name.trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }

    return Array.from(map.entries()).map(([client_name, positions]) => ({
      client_name,
      positions,
      total_cvs: positions.reduce((s, p) => s + p.total_cvs, 0),
      interviews: positions.reduce((s, p) => s + p.interviews, 0),
      joined: positions.reduce((s, p) => s + p.joined, 0),
      active: positions.reduce((s, p) => s + p.active_candidates, 0),
    })).sort((a, b) => a.client_name.localeCompare(b.client_name));
  }, [rows, search, clientFilter, suratFilter]);

  const flatRows = useMemo(() => {
    return rows.filter((r) => {
      const matchSearch = search === "" ||
        r.client_name.toLowerCase().includes(search.toLowerCase()) ||
        r.position_name.toLowerCase().includes(search.toLowerCase());
      const matchClient = clientFilter === "all" || r.client_name.trim() === clientFilter;
      const matchSurat = suratFilter === "all" || r.shared_with_surat === true;
      return matchSearch && matchClient && matchSurat;
    });
  }, [rows, search, clientFilter, suratFilter]);

  const toggleClient = (name: string) => {
    setCollapsedClients((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const totalPositions = clientGroups.reduce((s, g) => s + g.positions.length, 0);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-[28px] font-bold text-[#111827] tracking-tight">Position Summary</h1>
        <p className="text-sm text-[#6b7280] mt-0.5">Positions grouped by client with candidate funnel.</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "TOTAL POSITIONS", value: totalPositions, sub: `Across ${clientGroups.length} clients` },
          { label: "TOTAL CVS",       value: rows.reduce((s, r) => s + r.total_cvs, 0), sub: "All positions" },
          { label: "ACTIVE CLIENTS",  value: clientGroups.length, sub: "Recruiting now" },
        ].map((m) => (
          <div key={m.label} className="bg-white border border-[#e5e7eb] rounded-xl p-5">
            <div className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-2">{m.label}</div>
            <div className="text-[32px] font-bold text-[#111827] leading-none mb-1">{m.value}</div>
            <div className="text-[13px] text-[#9ca3af]">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-3 flex items-center gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search positions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] text-sm text-[#111827] placeholder-[#d1d5db] focus:outline-none focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/10 transition-all"
          />
        </div>

        {/* Client dropdown */}
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-[#e5e7eb] bg-white text-sm text-[#374151] focus:outline-none focus:border-[#6366f1] cursor-pointer min-w-[130px]"
        >
          <option value="all">All clients</option>
          {clientList.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Surat toggle */}
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-medium text-[#374151]">Surat positions</span>
          <button
            type="button"
            onClick={() => setSuratFilter(suratFilter === "surat" ? "all" : "surat")}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${suratFilter === "surat" ? "bg-[#6366f1]" : "bg-[#e5e7eb]"}`}
          >
            <span className={`absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-all duration-200 ${suratFilter === "surat" ? "left-[22px]" : "left-[3px]"}`} />
          </button>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1.5 ml-auto border-l border-[#e5e7eb] pl-3">
          <button
            type="button"
            onClick={() => setViewMode("grouped")}
            title="By Client"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${viewMode === "grouped" ? "bg-[#6366f1] text-white" : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]"}`}
          >
            <Users className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("flat")}
            title="List"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${viewMode === "flat" ? "bg-[#6366f1] text-white" : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]"}`}
          >
            <LayoutList className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center text-[#9ca3af] py-16 text-sm">Loading…</div>
      ) : (
        <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden">
          <table className="w-full border-collapse">
            {/* Table header */}
            <thead>
              <tr className="border-b border-[#f3f4f6]">
                <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider w-[45%]">Position</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider w-[18%]">Location</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider w-[22%]">Recruiter</th>
                <th className="px-6 py-3 text-right text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider w-[15%]">CVs</th>
              </tr>
            </thead>
            <tbody>
              {viewMode === "flat" ? (
                flatRows.length === 0 ? (
                  <tr><td colSpan={4} className="text-center text-[#9ca3af] py-12 text-sm">No positions found.</td></tr>
                ) : flatRows.map((p) => (
                  <tr key={p.id} className="border-b border-[#f9fafb] hover:bg-[#fafafa] transition-colors">
                    <td className="px-6 py-3.5 text-sm">
                      <span className="font-semibold text-[#111827]">{p.client_name}</span>
                      <span className="mx-2 text-[#d1d5db]">·</span>
                      <span className="text-[#374151]">{p.position_name}</span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-[#6b7280]">{p.location ?? "—"}</td>
                    <td className="px-4 py-3.5">
                      <RecruiterCell name={p.surat_recruiter_name} isSurat={p.shared_with_surat} />
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <CvBadge count={p.total_cvs} />
                    </td>
                  </tr>
                ))
              ) : clientGroups.length === 0 ? (
                <tr><td colSpan={4} className="text-center text-[#9ca3af] py-12 text-sm">No positions found.</td></tr>
              ) : clientGroups.map((group) => {
                const collapsed = collapsedClients.has(group.client_name);
                return (
                  <>
                    {/* Client group header */}
                    <tr
                      key={`g-${group.client_name}`}
                      className="border-b border-[#f3f4f6] bg-[#fafafa] hover:bg-[#f3f4f6] cursor-pointer transition-colors"
                      onClick={() => toggleClient(group.client_name)}
                    >
                      <td colSpan={4} className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <svg
                            className={`w-3 h-3 text-[#6366f1] flex-shrink-0 transition-transform duration-200 ${collapsed ? "" : "rotate-90"}`}
                            fill="currentColor" viewBox="0 0 20 20"
                          >
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                          <span className="text-[14px] font-semibold text-[#111827]">{group.client_name}</span>
                          <span className="bg-[#f3f4f6] text-[#6b7280] text-[11px] font-semibold px-2 py-0.5 rounded-md">
                            {group.positions.length} Position{group.positions.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* Position rows */}
                    {!collapsed && group.positions.map((p, idx) => (
                      <tr
                        key={p.id}
                        className={`hover:bg-[#fafafa] transition-colors ${idx < group.positions.length - 1 ? "border-b border-[#f3f4f6]" : "border-b border-[#f3f4f6]"}`}
                      >
                        <td className="pl-14 pr-6 py-3.5 text-[14px] font-medium text-[#111827]">{p.position_name}</td>
                        <td className="px-4 py-3.5 text-[14px] text-[#6b7280]">{p.location ?? "—"}</td>
                        <td className="px-4 py-3.5">
                          <RecruiterCell name={p.surat_recruiter_name} isSurat={p.shared_with_surat} />
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <button type="button" onClick={() => !p.shared_with_surat && setOpenPos(p)}>
                            <CvBadge count={p.total_cvs} clickable={!p.shared_with_surat} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Kanban dialog */}
      <Dialog open={!!openPos} onOpenChange={(o) => { if (!o) { setOpenPos(null); setDragId(null); setDragOverStage(null); } }}>
        <DialogContent className="max-w-[95vw] w-[95vw]">
          <DialogHeader>
            <DialogTitle>{openPos ? `${openPos.client_name} — ${openPos.position_name}` : ""}</DialogTitle>
            <DialogDescription>Drag candidate cards between columns to update their stage.</DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <div className="flex gap-3 pb-2 min-w-max">
              {CANDIDATE_STAGES.map((stage) => {
                const items = positionCandidates.filter((c) => c.stage === stage);
                const isOver = dragOverStage === stage;
                return (
                  <div
                    key={stage}
                    className={`w-60 shrink-0 rounded-lg border flex flex-col max-h-[70vh] transition-colors ${isOver ? "border-primary bg-primary/5" : "bg-muted/30"}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage); }}
                    onDragLeave={() => setDragOverStage(null)}
                    onDrop={(e) => {
                      e.preventDefault(); setDragOverStage(null);
                      if (dragId) {
                        const dragged = positionCandidates.find((c) => c.id === dragId);
                        if (dragged && dragged.stage !== stage) updateStage.mutate({ id: dragId, stage: stage as CandidateStage });
                      }
                      setDragId(null);
                    }}
                  >
                    <div className={`flex items-center justify-between px-3 py-2 border-b sticky top-0 rounded-t-lg ${isOver ? "bg-primary/10" : "bg-muted/50"}`}>
                      <StageBadge stage={stage} />
                      <span className="text-xs text-muted-foreground font-medium">{items.length}</span>
                    </div>
                    {isOver && dragId && <div className="mx-2 mt-2 rounded-md border-2 border-dashed border-primary/40 bg-primary/5 py-3 text-center text-xs text-primary">Drop to move here</div>}
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                      {items.length === 0 && !isOver ? (
                        <div className="text-xs text-muted-foreground text-center py-6">No candidates</div>
                      ) : items.map((c) => (
                        <div
                          key={c.id} draggable
                          onDragStart={(e) => { setDragId(c.id); e.dataTransfer.effectAllowed = "move"; }}
                          onDragEnd={() => { setDragId(null); setDragOverStage(null); }}
                          className={`rounded-md border bg-background p-2.5 text-xs space-y-1 cursor-grab active:cursor-grabbing select-none transition-opacity ${dragId === c.id ? "opacity-40" : "opacity-100"} hover:shadow-sm`}
                        >
                          <div className="flex items-center gap-1.5">
                            <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
                            <div className="font-semibold text-sm truncate">{c.candidate_name}</div>
                          </div>
                          {c.phone && <div className="text-muted-foreground pl-4">📞 {c.phone}</div>}
                          {c.source_recruiter && <div className="text-muted-foreground pl-4">👤 {c.source_recruiter}</div>}
                          {c.location && <div className="text-muted-foreground pl-4">📍 {c.location}</div>}
                          {c.next_action && <div className="text-muted-foreground truncate pl-4">➡ {c.next_action}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Avatar colours cycle through indigo, cyan, orange, pink, purple, green, red
const AVATAR_COLORS = [
  "from-indigo-400 to-indigo-600",
  "from-cyan-400 to-cyan-600",
  "from-orange-400 to-orange-600",
  "from-pink-400 to-pink-600",
  "from-purple-400 to-purple-600",
  "from-green-400 to-green-600",
  "from-red-400 to-red-600",
];

function getAvatarColor(name: string | null): string {
  if (!name) return "from-gray-300 to-gray-400";
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function RecruiterCell({ name, isSurat }: { name: string | null; isSurat: boolean }) {
  const displayName = isSurat && name ? name : null;
  const initial = displayName ? displayName[0].toUpperCase() : "—";
  const color = getAvatarColor(displayName);
  if (!displayName) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-[22px] h-[22px] rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-semibold text-gray-400 shrink-0">—</div>
        <span className="text-[14px] text-[#9ca3af]">Unassigned</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <div className={`w-[22px] h-[22px] rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
        {initial}
      </div>
      <span className="text-[14px] font-medium text-[#111827]">{displayName}</span>
    </div>
  );
}

function CvBadge({ count, clickable = false }: { count: number; clickable?: boolean }) {
  const isHigh = count >= 5;
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[12px] font-semibold transition-opacity ${isHigh ? "bg-[#dbeafe] text-[#1d4ed8]" : "bg-[#ede9fe] text-[#6d28d9]"} ${clickable ? "hover:opacity-75 cursor-pointer" : "cursor-default"}`}>
      {count} CV{count !== 1 ? "s" : ""}
    </span>
  );
}
