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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { StageBadge } from "@/components/StageBadge";
import {
  supabase,
  type Candidate,
  INACTIVE_STAGES,
  CANDIDATE_STAGES,
} from "@/lib/supabase";

export const Route = createFileRoute("/position-summary")({
  head: () => ({ meta: [{ title: "Position Summary — TalentFlow" }] }),
  component: PositionSummaryPage,
});

type PositionRow = {
  key: string;
  client_name: string;
  position_name: string;
  source_recruiter: string;
  total_cvs: number;
  interviews: number;
  joined: number;
  active_candidates: number;
  days_open: number;
  status: "Open" | "Closed" | "On Hold";
};

function PositionSummaryPage() {
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "active_candidates", desc: true },
  ]);
  const [openPos, setOpenPos] = useState<PositionRow | null>(null);

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["candidates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Candidate[];
    },
  });

  const rows = useMemo<PositionRow[]>(() => {
    const map = new Map<string, PositionRow & { _recruiters: Set<string>; _oldestDate: string | null }>();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    for (const c of candidates) {
      const key = `${c.client_name.trim().toLowerCase()}||${c.position_name.trim().toLowerCase()}`;
      let r = map.get(key);
      if (!r) {
        r = {
          key,
          client_name: c.client_name,
          position_name: c.position_name,
          source_recruiter: "",
          total_cvs: 0,
          interviews: 0,
          joined: 0,
          active_candidates: 0,
          days_open: 0,
          status: "Open",
          _recruiters: new Set(),
          _oldestDate: null,
        };
        map.set(key, r);
      }
      r.total_cvs += 1;
      if (!(INACTIVE_STAGES as string[]).includes(c.stage)) {
        r.active_candidates += 1;
      }
      if (["Interview Scheduled", "Interview Attended", "Selected", "Offered", "Joined"].includes(c.stage as string)) {
        r.interviews += 1;
      }
      if (c.stage === "Joined") r.joined += 1;
      if (c.source_recruiter) r._recruiters.add(c.source_recruiter);

      // Track oldest date_sourced
      if (c.date_sourced) {
        if (!r._oldestDate || c.date_sourced < r._oldestDate) {
          r._oldestDate = c.date_sourced;
        }
      }
    }

    return Array.from(map.values()).map((r) => {
      const allInactive = candidates
        .filter((c) => `${c.client_name.trim().toLowerCase()}||${c.position_name.trim().toLowerCase()}` === r.key)
        .every((c) => (INACTIVE_STAGES as string[]).includes(c.stage));

      let days_open = 0;
      if (r._oldestDate) {
        const oldest = new Date(r._oldestDate); oldest.setHours(0, 0, 0, 0);
        days_open = Math.floor((today.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24));
      }

      return {
        ...r,
        source_recruiter: Array.from(r._recruiters).join(", "),
        days_open,
        status: r.total_cvs > 0 && allInactive ? "Closed" : "Open",
      } as PositionRow;
    });
  }, [candidates]);

  const positionCandidates = useMemo(() => {
    if (!openPos) return [] as Candidate[];
    return candidates.filter(
      (c) =>
        c.client_name.trim().toLowerCase() === openPos.client_name.trim().toLowerCase() &&
        c.position_name.trim().toLowerCase() === openPos.position_name.trim().toLowerCase(),
    );
  }, [openPos, candidates]);

  const columns = useMemo<ColumnDef<PositionRow>[]>(
    () => [
      { accessorKey: "client_name", header: "Client" },
      { accessorKey: "position_name", header: "Position" },
      { accessorKey: "source_recruiter", header: "Source Recruiter" },
      {
        accessorKey: "total_cvs",
        header: "Total CVs",
        cell: ({ getValue }) => (
          <span className="tabular-nums font-medium">{getValue() as number}</span>
        ),
      },
      {
        accessorKey: "interviews",
        header: "Interviews",
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue() as number}</span>
        ),
      },
      {
        accessorKey: "joined",
        header: "Joined",
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue() as number}</span>
        ),
      },
      {
        accessorKey: "days_open",
        header: "Days Open",
        cell: ({ getValue }) => {
          const days = getValue() as number;
          let cls = "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400";
          if (days >= 60) cls = "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400";
          else if (days >= 30) cls = "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
          return (
            <Badge variant="outline" className={cls}>
              {days}d
            </Badge>
          );
        },
      },
      {
        accessorKey: "active_candidates",
        header: "Active",
        cell: ({ getValue, row }) => (
          <button
            type="button"
            onClick={() => setOpenPos(row.original)}
            className="cursor-pointer"
          >
            <Badge className="hover:bg-primary/80">{getValue() as number}</Badge>
          </button>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => {
          const s = getValue() as string;
          return (
            <Badge
              variant="outline"
              className={
                s === "Open"
                  ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
                  : "border-muted text-muted-foreground"
              }
            >
              {s}
            </Badge>
          );
        },
      },
    ],
    [],
  );

  // Unique client list for dropdown
  const clientList = useMemo(() => {
    const names = Array.from(new Set(rows.map((r) => r.client_name.trim()))).sort();
    return names;
  }, [rows]);

  // Apply client filter on top of global search
  const filteredRows = useMemo(() => {
    if (clientFilter === "all") return rows;
    return rows.filter((r) => r.client_name.trim().toLowerCase() === clientFilter.toLowerCase());
  }, [rows, clientFilter]);

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
          Auto-generated from the candidate pipeline. One row per Client + Position.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Search positions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clientList.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {table.getFilteredRowModel().rows.length} positions
        </span>
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
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
                      No positions yet. Add candidates to populate this view.
                    </TableCell>
                  </TableRow>
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

      <Dialog open={!!openPos} onOpenChange={(o) => !o && setOpenPos(null)}>
        <DialogContent className="max-w-[95vw] w-[95vw] sm:max-w-[95vw]">
          <DialogHeader>
            <DialogTitle>
              {openPos ? `${openPos.client_name} — ${openPos.position_name}` : ""}
            </DialogTitle>
            <DialogDescription>
              Full pipeline view across all stages for this position.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <div className="flex gap-3 pb-2 min-w-max">
              {CANDIDATE_STAGES.map((stage) => {
                const items = positionCandidates.filter((c) => c.stage === stage);
                return (
                  <div
                    key={stage}
                    className="w-64 shrink-0 rounded-lg border bg-muted/30 flex flex-col max-h-[70vh]"
                  >
                    <div className="flex items-center justify-between px-3 py-2 border-b sticky top-0 bg-muted/50 rounded-t-lg">
                      <StageBadge stage={stage} />
                      <span className="text-xs text-muted-foreground font-medium">
                        {items.length}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                      {items.length === 0 ? (
                        <div className="text-xs text-muted-foreground text-center py-4">
                          No candidates
                        </div>
                      ) : (
                        items.map((c) => (
                          <div
                            key={c.id}
                            className="rounded-md border bg-background p-2 text-xs space-y-1"
                          >
                            <div className="font-medium text-sm">{c.candidate_name}</div>
                            {c.source_recruiter && (
                              <div className="text-muted-foreground">
                                Recruiter: {c.source_recruiter}
                              </div>
                            )}
                            {c.location && (
                              <div className="text-muted-foreground">{c.location}</div>
                            )}
                            {c.ctc && (
                              <div className="text-muted-foreground">CTC: {c.ctc}</div>
                            )}
                            {c.next_action && (
                              <div className="text-muted-foreground truncate">
                                Next: {c.next_action}
                              </div>
                            )}
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
