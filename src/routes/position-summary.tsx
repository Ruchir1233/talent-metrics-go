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
import { supabase, type Candidate } from "@/lib/supabase";

export const Route = createFileRoute("/position-summary")({
  head: () => ({ meta: [{ title: "Position Summary — TalentFlow" }] }),
  component: PositionSummaryPage,
});

type PositionRow = {
  key: string;
  client_name: string;
  position_name: string;
  source_recruiter: string;
  crm_owner: string;
  active_candidates: number;
};

function PositionSummaryPage() {
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "active_candidates", desc: true },
  ]);

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
    const map = new Map<string, PositionRow & { _recruiters: Set<string>; _owners: Set<string> }>();
    for (const c of candidates) {
      const key = `${c.client_name}||${c.position_name}`;
      let r = map.get(key);
      if (!r) {
        r = {
          key,
          client_name: c.client_name,
          position_name: c.position_name,
          source_recruiter: "",
          crm_owner: "",
          active_candidates: 0,
          _recruiters: new Set(),
          _owners: new Set(),
        };
        map.set(key, r);
      }
      r.active_candidates += 1;
      if (c.source_recruiter) r._recruiters.add(c.source_recruiter);
      if (c.crm_owner) r._owners.add(c.crm_owner);
    }
    return Array.from(map.values()).map((r) => ({
      ...r,
      source_recruiter: Array.from(r._recruiters).join(", "),
      crm_owner: Array.from(r._owners).join(", "),
    }));
  }, [candidates]);

  const columns = useMemo<ColumnDef<PositionRow>[]>(
    () => [
      { accessorKey: "client_name", header: "Client" },
      { accessorKey: "position_name", header: "Position" },
      { accessorKey: "source_recruiter", header: "Source Recruiter" },
      { accessorKey: "crm_owner", header: "CRM Owner" },
      {
        accessorKey: "active_candidates",
        header: "Active Candidates",
        cell: ({ getValue }) => <Badge>{getValue() as number}</Badge>,
      },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
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

      <div className="flex items-center gap-2">
        <Input
          placeholder="Search clients or positions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
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
    </div>
  );
}
