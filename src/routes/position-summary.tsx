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
          Positions grouped by client with candidate funnel. Manage positions from the Positions page.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input placeholder="Search positions…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All clients" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clientList.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="surat-filter" checked={suratFilter === "surat"} onCheckedChange={(v) => setSuratFilter(v ? "surat" : "all")} />
          <Label htmlFor="surat-filter" className="text-sm cursor-pointer">Surat positions</Label>
        </div>
        <span className="text-xs text-muted-foreground">
          {viewMode === "grouped" ? `${totalPositions} positions · ${clientGroups.length} clients` : `${flatRows.length} positions`}
        </span>
        <div className="ml-auto flex items-center rounded-lg border bg-muted/30 p-0.5 gap-0.5">
          <button type="button" onClick={() => setViewMode("grouped")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === "grouped" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Users className="h-3.5 w-3.5" />By Client
          </button>
          <button type="button" onClick={() => setViewMode("flat")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === "flat" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <LayoutList className="h-3.5 w-3.5" />List
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">Loading…</div>
      ) : viewMode === "flat" ? (
        /* ── FLAT LIST VIEW ── */
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>CTC</TableHead>
                    <TableHead>Surat Recruiter</TableHead>
                    <TableHead className="text-center">Total CVs</TableHead>
                    <TableHead className="text-center">Interviews</TableHead>
                    <TableHead className="text-center">Joined</TableHead>
                    <TableHead>Days Open</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flatRows.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No positions found.</TableCell></TableRow>
                  ) : flatRows.map((p) => {
                    const daysColor = p.days_open >= 60 ? "border-red-500/40 bg-red-500/10 text-red-700" : p.days_open >= 30 ? "border-amber-500/40 bg-amber-500/10 text-amber-700" : "border-green-500/40 bg-green-500/10 text-green-700";
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.client_name}</TableCell>
                        <TableCell>{p.position_name}</TableCell>
                        <TableCell className="text-muted-foreground">{p.location ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{p.ctc ?? "—"}</TableCell>
                        <TableCell>
                          {p.shared_with_surat
                            ? <span className="text-sm font-medium text-blue-700">{p.surat_recruiter_name || "Surat"}</span>
                            : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-center tabular-nums font-medium">{p.total_cvs}</TableCell>
                        <TableCell className="text-center tabular-nums">{p.interviews}</TableCell>
                        <TableCell className="text-center tabular-nums">{p.joined}</TableCell>
                        <TableCell><Badge variant="outline" className={daysColor}>{p.days_open}d</Badge></TableCell>
                        <TableCell>
                          <button type="button" onClick={() => !p.shared_with_surat && setOpenPos(p)}>
                            <Badge className={!p.shared_with_surat ? "hover:bg-primary/80 cursor-pointer" : "cursor-default"}>
                              {p.shared_with_surat ? (p.surat_cv_count || 0) : p.active_candidates}
                            </Badge>
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : clientGroups.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">No positions found.</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 pl-4"></TableHead>
                  <TableHead className="w-1/3">Position</TableHead>
                  <TableHead className="w-1/4">Location</TableHead>
                  <TableHead className="w-1/4">Recruiter</TableHead>
                  <TableHead className="w-24 text-right pr-6">Total CVs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientGroups.map((group) => {
                  const collapsed = collapsedClients.has(group.client_name);
                  return (
                    <>
                      {/* Client header row */}
                      <TableRow
                        key={`group-${group.client_name}`}
                        className="bg-muted/40 hover:bg-muted/60 cursor-pointer border-t"
                        onClick={() => toggleClient(group.client_name)}
                      >
                        <TableCell className="py-3 pl-4">
                          {collapsed
                            ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          }
                        </TableCell>
                        <TableCell colSpan={3} className="py-3">
                          <span className="font-semibold">{group.client_name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {group.positions.length} position{group.positions.length !== 1 ? "s" : ""}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 text-right pr-6">
                          <span className="tabular-nums font-medium text-sm text-muted-foreground">{group.total_cvs} CVs</span>
                        </TableCell>
                      </TableRow>

                      {/* Position rows */}
                      {!collapsed && group.positions.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="pl-4"></TableCell>
                          <TableCell className="font-medium pl-8">{p.position_name}</TableCell>
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
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
