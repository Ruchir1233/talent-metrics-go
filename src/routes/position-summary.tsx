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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Position Summary</h1>
        <p className="text-sm text-muted-foreground">
          Live view of all positions with candidate funnel.
        </p>
      </div>

      {/* ── PREMIUM DASHBOARD CARD ── */}
      <div className="rounded-xl border shadow-sm overflow-hidden bg-background">

        {/* Blue toolbar */}
        <div className="bg-primary px-6 py-3.5 flex items-center gap-3 flex-wrap">
          <Input
            placeholder="Search positions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 bg-white/15 border-white/25 text-white placeholder:text-white/55 focus-visible:ring-white/40 h-8 text-sm"
          />
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-40 bg-white/15 border-white/25 text-white h-8 text-sm [&>span]:text-white [&>svg]:text-white/70">
              <SelectValue placeholder="All clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clientList.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch
              id="surat-filter"
              checked={suratFilter === "surat"}
              onCheckedChange={(v) => setSuratFilter(v ? "surat" : "all")}
              className="data-[state=checked]:bg-white data-[state=unchecked]:bg-white/30"
            />
            <Label htmlFor="surat-filter" className="text-sm cursor-pointer text-white/90 select-none">
              Surat positions
            </Label>
          </div>
          <span className="text-xs text-white/50">
            {viewMode === "grouped"
              ? `${totalPositions} positions · ${clientGroups.length} clients`
              : `${flatRows.length} positions`}
          </span>
          <div className="ml-auto flex items-center rounded-md bg-white/15 p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setViewMode("grouped")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                viewMode === "grouped" ? "bg-white text-primary shadow" : "text-white/70 hover:text-white"
              }`}
            >
              <Users className="h-3.5 w-3.5" /> By Client
            </button>
            <button
              type="button"
              onClick={() => setViewMode("flat")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                viewMode === "flat" ? "bg-white text-primary shadow" : "text-white/70 hover:text-white"
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" /> List
            </button>
          </div>
        </div>

        {/* Table area */}
        {isLoading ? (
          <div className="text-center text-muted-foreground py-16">Loading…</div>

        ) : viewMode === "flat" ? (
          /* ── FLAT LIST VIEW ── */
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20 border-b">
                  <TableHead className="pl-6 py-3 w-[22%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client</TableHead>
                  <TableHead className="py-3 w-[28%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Position</TableHead>
                  <TableHead className="py-3 w-[15%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location</TableHead>
                  <TableHead className="py-3 w-[15%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recruiter</TableHead>
                  <TableHead className="py-3 pr-6 w-[10%] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">CVs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flatRows.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-16">No positions found.</TableCell></TableRow>
                ) : flatRows.map((p) => (
                  <TableRow key={p.id} className="hover:bg-muted/20 transition-colors">
                    <TableCell className="pl-6 font-semibold">{p.client_name}</TableCell>
                    <TableCell className="text-foreground/80">{p.position_name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.location ?? "—"}</TableCell>
                    <TableCell>
                      {p.shared_with_surat
                        ? <span className="text-sm font-medium text-blue-600">{p.surat_recruiter_name || "Surat"}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <span className="tabular-nums font-semibold">{p.total_cvs}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

        ) : clientGroups.length === 0 ? (
          <div className="text-center text-muted-foreground py-16">No positions found.</div>

        ) : (
          /* ── GROUPED BY CLIENT VIEW ── */
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20 border-b">
                  <TableHead className="w-10 pl-4"></TableHead>
                  <TableHead className="py-3 w-[40%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Position</TableHead>
                  <TableHead className="py-3 w-[20%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location</TableHead>
                  <TableHead className="py-3 w-[20%] text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recruiter</TableHead>
                  <TableHead className="py-3 pr-6 w-[10%] text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">CVs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientGroups.map((group) => {
                  const collapsed = collapsedClients.has(group.client_name);
                  return (
                    <>
                      {/* Client group header */}
                      <TableRow
                        key={`group-${group.client_name}`}
                        className="bg-muted/30 hover:bg-muted/50 cursor-pointer border-t-2 border-border/60 transition-colors"
                        onClick={() => toggleClient(group.client_name)}
                      >
                        <TableCell className="pl-4 py-3">
                          {collapsed
                            ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell colSpan={3} className="py-3">
                          <span className="font-bold text-sm">{group.client_name}</span>
                          <span className="ml-2.5 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {group.positions.length} position{group.positions.length !== 1 ? "s" : ""}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 pr-6 text-right">
                          <span className="tabular-nums text-sm font-semibold text-primary">{group.total_cvs}</span>
                          <span className="text-xs text-muted-foreground ml-1">CVs</span>
                        </TableCell>
                      </TableRow>

                      {/* Position rows */}
                      {!collapsed && group.positions.map((p, i) => (
                        <TableRow
                          key={p.id}
                          className={`hover:bg-muted/10 transition-colors ${i === group.positions.length - 1 ? "border-b border-border/40" : ""}`}
                        >
                          <TableCell className="pl-4">
                            <div className="w-px h-full border-l-2 border-muted ml-1.5" />
                          </TableCell>
                          <TableCell className="py-3 pl-8 font-medium text-sm">{p.position_name}</TableCell>
                          <TableCell className="py-3 text-sm text-muted-foreground">{p.location ?? "—"}</TableCell>
                          <TableCell className="py-3 text-sm">
                            {p.shared_with_surat
                              ? <span className="font-medium text-blue-600">{p.surat_recruiter_name || "Surat"}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="py-3 pr-6 text-right">
                            <span className="tabular-nums font-semibold text-sm">{p.total_cvs}</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  );
                })}
              </TableBody>
            </Table>
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
