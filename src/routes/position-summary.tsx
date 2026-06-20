import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ArrowUpDown, GripVertical, Share2 } from "lucide-react";
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
import { StageBadge } from "@/components/StageBadge";
import {
  supabase, type Candidate, type Position, type CandidateStage,
  INACTIVE_STAGES, CANDIDATE_STAGES,
} from "@/lib/supabase";

export const Route = createFileRoute("/position-summary")({
  head: () => ({ meta: [{ title: "Position Summary — Kaapro" }] }),
  component: PositionSummaryPage,
});

const STATUS_COLORS: Record<string, string> = {
  Open: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400",
  "On Hold": "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  Closed: "border-muted text-muted-foreground",
};

type PositionRow = Position & {
  total_cvs: number;
  interviews: number;
  joined: number;
  active_candidates: number;
  days_open: number;
};

function PositionSummaryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([{ id: "days_open", desc: true }]);
  const [openPos, setOpenPos] = useState<PositionRow | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const { data: positions = [], isLoading: posLoading } = useQuery({
    queryKey: ["positions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("positions").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Position[];
    },
  });

  const { data: candidates = [] } = useQuery({
    queryKey: ["candidates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("candidates").select("*").order("created_at", { ascending: false });
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

  // Build rows from positions master table, join candidate counts
  const rows = useMemo<PositionRow[]>(() => {
    return positions.map((p) => {
      // Match candidates by position_id first, fall back to name match for old data
      const positionCands = candidates.filter((c) =>
        c.position_id === p.id ||
        (c.client_name?.trim().toLowerCase() === p.client_name.trim().toLowerCase() &&
          c.position_name?.trim().toLowerCase() === p.position_name.trim().toLowerCase())
      );

      const total_cvs = positionCands.length;
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

  // Candidates for selected position (for kanban)
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

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchSearch = search === "" ||
        r.client_name.toLowerCase().includes(search.toLowerCase()) ||
        r.position_name.toLowerCase().includes(search.toLowerCase());
      const matchClient = clientFilter === "all" || r.client_name.trim() === clientFilter;
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      return matchSearch && matchClient && matchStatus;
    });
  }, [rows, search, clientFilter, statusFilter]);

  const columns = useMemo<ColumnDef<PositionRow>[]>(() => [
    { accessorKey: "client_name", header: "Client" },
    { accessorKey: "position_name", header: "Position" },
    { accessorKey: "location", header: "Location", cell: ({ getValue }) => <span className="text-muted-foreground">{(getValue() as string) ?? "—"}</span> },
    {
      accessorKey: "shared_with_surat",
      header: "Surat",
      cell: ({ getValue }) => getValue() ? (
        <Badge className="bg-blue-500/10 text-blue-700 border-blue-500/30 border text-xs">
          <Share2 className="h-3 w-3 mr-1" />Surat
        </Badge>
      ) : <span className="text-muted-foreground">—</span>,
    },
    { accessorKey: "total_cvs", header: "Total CVs", cell: ({ getValue }) => <span className="tabular-nums font-medium">{getValue() as number}</span> },
    { accessorKey: "interviews", header: "Interviews", cell: ({ getValue }) => <span className="tabular-nums">{getValue() as number}</span> },
    { accessorKey: "joined", header: "Joined", cell: ({ getValue }) => <span className="tabular-nums">{getValue() as number}</span> },
    {
      accessorKey: "days_open",
      header: "Days Open",
      cell: ({ getValue }) => {
        const days = getValue() as number;
        let cls = "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400";
        if (days >= 60) cls = "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400";
        else if (days >= 30) cls = "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
        return <Badge variant="outline" className={cls}>{days}d</Badge>;
      },
    },
    {
      accessorKey: "active_candidates",
      header: "Active",
      cell: ({ getValue, row }) => (
        <button type="button" onClick={() => setOpenPos(row.original)}>
          <Badge className="hover:bg-primary/80 cursor-pointer">{getValue() as number}</Badge>
        </button>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ getValue }) => (
        <Badge variant="outline" className={STATUS_COLORS[(getValue() as string)] ?? ""}>{getValue() as string}</Badge>
      ),
    },
  ], []);

  const table = useReactTable({
    data: filteredRows,
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Position Summary</h1>
        <p className="text-sm text-muted-foreground">
          Live view of all positions with candidate funnel. Manage positions from the Positions page.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Input placeholder="Search positions…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All clients" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clientList.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Open">Open</SelectItem>
            <SelectItem value="On Hold">On Hold</SelectItem>
            <SelectItem value="Closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{table.getFilteredRowModel().rows.length} positions</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((h) => (
                      <TableHead key={h.id} className="whitespace-nowrap">
                        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={h.column.getToggleSortingHandler()}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <ArrowUpDown className="h-3 w-3 opacity-60" />
                        </button>
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {posLoading ? (
                  <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                ) : table.getRowModel().rows.length === 0 ? (
                  <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
                    No positions found. Create positions in the Positions page.
                  </TableCell></TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id} className="whitespace-nowrap">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Kanban dialog with drag-and-drop */}
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
