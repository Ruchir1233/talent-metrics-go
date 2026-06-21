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
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }} className="min-h-screen bg-[#f8fafc]">
      <div className="px-12 py-8 max-w-[1400px] mx-auto">

        {/* Page header */}
        <div className="mb-5">
          <h1 className="text-[26px] font-bold text-[#0f172a] tracking-tight mb-1">Position Summary</h1>
          <p className="text-[13px] text-[#64748b]">Positions grouped by client with candidate funnel.</p>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          {[
            { label: "Total Positions", value: totalPositions, sub: `Across ${clientGroups.length} clients` },
            { label: "Total CVs", value: rows.reduce((s, r) => s + r.total_cvs, 0), sub: "All positions" },
            { label: "Active Clients", value: clientGroups.length, sub: "Recruiting now" },
          ].map((m) => (
            <div key={m.label} className="bg-white border border-[#e2e8f0] rounded-lg px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div className="text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.3px] mb-1.5">{m.label}</div>
              <div className="text-[22px] font-bold text-[#0f172a] mb-1">{m.value}</div>
              <div className="text-[11px] text-[#94a3b8]">{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Filter toolbar */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg px-4 py-3 mb-4 flex items-center gap-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <input
            type="text"
            placeholder="Search positions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 border border-[#e2e8f0] rounded-md text-[13px] bg-[#f8fafc] text-[#0f172a] placeholder-[#cbd5e1] focus:outline-none focus:bg-white focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/10"
          />
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="px-3 py-2 border border-[#e2e8f0] rounded-md text-[13px] text-[#0f172a] bg-white focus:outline-none focus:border-[#4f46e5] cursor-pointer"
          >
            <option value="all">All clients</option>
            {clientList.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Surat toggle */}
          <div className="flex items-center gap-2 pl-3 border-l border-[#e2e8f0]">
            <span className="text-[13px] font-medium text-[#0f172a]">Surat positions</span>
            <button
              type="button"
              onClick={() => setSuratFilter(suratFilter === "surat" ? "all" : "surat")}
              className={`w-[34px] h-[20px] rounded-full relative transition-colors duration-200 focus:outline-none ${suratFilter === "surat" ? "bg-[#4f46e5]" : "bg-[#e2e8f0]"}`}
            >
              <span className={`absolute top-[2px] w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${suratFilter === "surat" ? "left-[16px]" : "left-[2px]"}`} />
            </button>
          </div>

          {/* Count */}
          <span className="text-[12px] text-[#94a3b8]">
            {viewMode === "grouped" ? `${totalPositions} positions · ${clientGroups.length} clients` : `${flatRows.length} positions`}
          </span>

          {/* View switcher */}
          <div className="flex gap-1.5 ml-auto pl-3 border-l border-[#e2e8f0]">
            <button
              type="button"
              onClick={() => setViewMode("grouped")}
              title="By Client"
              className={`w-8 h-8 border rounded flex items-center justify-center text-xs transition-all ${viewMode === "grouped" ? "bg-[#eef2ff] border-[#4f46e5] text-[#4f46e5]" : "bg-white border-[#e2e8f0] text-[#64748b] hover:bg-[#f1f5f9]"}`}
            >
              <Users className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("flat")}
              title="List"
              className={`w-8 h-8 border rounded flex items-center justify-center text-xs transition-all ${viewMode === "flat" ? "bg-[#eef2ff] border-[#4f46e5] text-[#4f46e5]" : "bg-white border-[#e2e8f0] text-[#64748b] hover:bg-[#f1f5f9]"}`}
            >
              <LayoutList className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="text-center text-[#64748b] py-16 text-sm">Loading…</div>
        ) : (
          <div className="bg-white border border-[#e2e8f0] rounded-lg overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <table className="w-full border-collapse">
              <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.3px] w-[45%]">Position</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.3px] w-[20%]">Location</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.3px] w-[20%]">Recruiter</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.3px] w-[15%] pr-4">CVs</th>
                </tr>
              </thead>
              <tbody>
                {viewMode === "flat" ? (
                  flatRows.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-[#64748b] py-12 text-sm">No positions found.</td></tr>
                  ) : flatRows.map((p) => (
                    <tr key={p.id} className="border-b border-[#f1f5f8] hover:bg-[#fafbfc] transition-colors">
                      <td className="px-4 py-2.5 text-[13px]">
                        <span className="font-medium text-[#0f172a]">{p.client_name}</span>
                        <span className="mx-1.5 text-[#cbd5e1]">·</span>
                        <span className="text-[#64748b]">{p.position_name}</span>
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-[#64748b]">{p.location ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        {p.shared_with_surat && p.surat_recruiter_name ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                              {p.surat_recruiter_name[0].toUpperCase()}
                            </div>
                            <span className="text-[13px] font-medium text-[#0f172a]">{p.surat_recruiter_name}</span>
                          </div>
                        ) : (
                          <span className="text-[13px] text-[#94a3b8]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right pr-4">
                        <span className="inline-block bg-[#f0f4ff] text-[#6366f1] px-2 py-0.5 rounded-full text-[11px] font-semibold">
                          {p.total_cvs} CV{p.total_cvs !== 1 ? "s" : ""}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : clientGroups.length === 0 ? (
                  <tr><td colSpan={4} className="text-center text-[#64748b] py-12 text-sm">No positions found.</td></tr>
                ) : clientGroups.map((group) => {
                  const collapsed = collapsedClients.has(group.client_name);
                  return (
                    <>
                      {/* Client header row */}
                      <tr
                        key={`g-${group.client_name}`}
                        className="bg-[#fafbfc] border-b border-[#eff2f5] hover:bg-[#f5f7fa] cursor-pointer transition-colors"
                        onClick={() => toggleClient(group.client_name)}
                      >
                        <td colSpan={4} className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className={`text-[#cbd5e1] text-[11px] transition-transform duration-200 ${collapsed ? "" : "rotate-90"} inline-block`}>▶</span>
                            <span className="text-[13px] font-semibold text-[#0f172a]">{group.client_name}</span>
                            <span className="bg-[#e2e8f0] text-[#64748b] px-1.5 py-0.5 rounded text-[10px] font-semibold">
                              {group.positions.length} Position{group.positions.length !== 1 ? "s" : ""}
                            </span>
                            <span className="ml-auto text-[12px] font-semibold text-[#4f46e5] pr-0">{group.total_cvs} CVs</span>
                          </div>
                        </td>
                      </tr>

                      {/* Position rows */}
                      {!collapsed && group.positions.map((p) => (
                        <tr key={p.id} className="border-b border-[#f1f5f8] hover:bg-[#fafbfc] transition-colors">
                          <td className="py-2.5 pl-10 pr-4 text-[13px] font-medium text-[#0f172a]">{p.position_name}</td>
                          <td className="px-4 py-2.5 text-[13px] text-[#64748b]">{p.location ?? "—"}</td>
                          <td className="px-4 py-2.5">
                            {p.shared_with_surat && p.surat_recruiter_name ? (
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                                  {p.surat_recruiter_name[0].toUpperCase()}
                                </div>
                                <span className="text-[13px] font-medium text-[#0f172a]">{p.surat_recruiter_name}</span>
                              </div>
                            ) : (
                              <span className="text-[13px] text-[#94a3b8]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 pr-4 text-right">
                            <button type="button" onClick={() => !p.shared_with_surat && setOpenPos(p)}>
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${p.total_cvs >= 5 ? "bg-[#e0f2fe] text-[#0284c7]" : "bg-[#f0f4ff] text-[#6366f1]"} ${!p.shared_with_surat ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}>
                                {p.total_cvs} CV{p.total_cvs !== 1 ? "s" : ""}
                              </span>
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
      </div>

      {/* Kanban drag-and-drop dialog */}
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
                      e.preventDefault();
                      setDragOverStage(null);
                      if (dragId) {
                        const dragged = positionCandidates.find((c) => c.id === dragId);
                        if (dragged && dragged.stage !== stage) {
                          updateStage.mutate({ id: dragId, stage: stage as CandidateStage });
                        }
                      }
                      setDragId(null);
                    }}
                  >
                    <div className={`flex items-center justify-between px-3 py-2 border-b sticky top-0 rounded-t-lg ${isOver ? "bg-primary/10" : "bg-muted/50"}`}>
                      <StageBadge stage={stage} />
                      <span className="text-xs text-muted-foreground font-medium">{items.length}</span>
                    </div>
                    {isOver && dragId && (
                      <div className="mx-2 mt-2 rounded-md border-2 border-dashed border-primary/40 bg-primary/5 py-3 text-center text-xs text-primary">Drop to move here</div>
                    )}
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                      {items.length === 0 && !isOver ? (
                        <div className="text-xs text-muted-foreground text-center py-6">No candidates</div>
                      ) : (
                        items.map((c) => (
                          <div
                            key={c.id}
                            draggable
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
                        ))
                      )}
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
