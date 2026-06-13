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
import { ArrowUpDown, Pencil, Plus, Trash2, AlertCircle, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  supabase,
  type Candidate,
  type Recruiter,
  CANDIDATE_STAGES,
} from "@/lib/supabase";
import { RecruiterCombobox } from "@/components/RecruiterCombobox";
import { StageBadge } from "@/components/StageBadge";

export const Route = createFileRoute("/candidate-pipeline")({
  head: () => ({ meta: [{ title: "Candidate Pipeline — TalentFlow" }] }),
  component: CandidatePipelinePage,
});

type FormState = {
  client_name: string;
  position_name: string;
  location: string;
  ctc: string;
  candidate_name: string;
  crm_owner: string;
  source_recruiter: string;
  stage: string;
  date_sourced: string;
  next_action: string;
  next_action_date: string;
  status_comment: string;
};

const emptyForm: FormState = {
  client_name: "",
  position_name: "",
  location: "",
  ctc: "",
  candidate_name: "",
  crm_owner: "",
  source_recruiter: "",
  stage: "Submitted",
  date_sourced: new Date().toISOString().slice(0, 10),
  next_action: "",
  next_action_date: "",
  status_comment: "",
};

function getRowUrgency(c: Candidate): "overdue" | "today" | "soon" | "none" {
  if (!c.next_action_date) return "none";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(c.next_action_date); d.setHours(0, 0, 0, 0);
  if (d < today) return "overdue";
  if (d.getTime() === today.getTime()) return "today";
  const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (diff <= 2) return "soon";
  return "none";
}

const urgencyRowClass: Record<string, string> = {
  overdue: "bg-red-50/40 dark:bg-red-950/20",
  today: "bg-amber-50/40 dark:bg-amber-950/20",
  soon: "",
  none: "",
};

function CandidatePipelinePage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "created_at", desc: true },
  ]);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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

  const { data: activeRecruiters = [] } = useQuery({
    queryKey: ["recruiters", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recruiters")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Recruiter[];
    },
  });
  const activeNames = activeRecruiters.map((r) => r.name);

  // Apply stage filter on top of table global filter
  const filteredCandidates = useMemo(() => {
    if (stageFilter === "all") return candidates;
    return candidates.filter((c) => c.stage === stageFilter);
  }, [candidates, stageFilter]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.client_name.trim()) throw new Error("Client name is required");
      if (!form.position_name.trim()) throw new Error("Position name is required");
      if (!form.candidate_name.trim()) throw new Error("Candidate name is required");

      const payload = {
        client_name: form.client_name.trim(),
        position_name: form.position_name.trim(),
        location: form.location.trim() || null,
        ctc: form.ctc.trim() || null,
        candidate_name: form.candidate_name.trim(),
        crm_owner: form.crm_owner.trim() || null,
        source_recruiter: form.source_recruiter.trim() || null,
        stage: form.stage,
        date_sourced: form.date_sourced || null,
        next_action: form.next_action.trim() || null,
        next_action_date: form.next_action_date || null,
        status_comment: form.status_comment.trim() || null,
      };
      if (editing) {
        const { error } = await supabase
          .from("candidates")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("candidates").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Candidate saved successfully.");
      qc.invalidateQueries({ queryKey: ["candidates"] });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("candidates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidate removed from pipeline.");
      qc.invalidateQueries({ queryKey: ["candidates"] });
      setDeleteId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const quickStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase
        .from("candidates")
        .update({ stage })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { stage }) => {
      toast.success(`Stage updated to "${stage}".`);
      qc.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (c: Candidate) => {
    setEditing(c);
    setForm({
      client_name: c.client_name ?? "",
      position_name: c.position_name ?? "",
      location: c.location ?? "",
      ctc: c.ctc ?? "",
      candidate_name: c.candidate_name ?? "",
      crm_owner: c.crm_owner ?? "",
      source_recruiter: c.source_recruiter ?? "",
      stage: c.stage ?? "Submitted",
      date_sourced: c.date_sourced ?? "",
      next_action: c.next_action ?? "",
      next_action_date: c.next_action_date ?? "",
      status_comment: c.status_comment ?? "",
    });
    setOpen(true);
  };

  const columns = useMemo<ColumnDef<Candidate>[]>(
    () => [
      { accessorKey: "client_name", header: "Client" },
      { accessorKey: "position_name", header: "Position" },
      { accessorKey: "location", header: "Location" },
      { accessorKey: "ctc", header: "CTC" },
      { accessorKey: "candidate_name", header: "Candidate" },
      { accessorKey: "crm_owner", header: "CRM Owner" },
      { accessorKey: "source_recruiter", header: "Source Recruiter" },
      {
        accessorKey: "stage",
        header: "Stage",
        cell: ({ getValue, row }) => {
          const currentStage = (getValue() as string) ?? "Submitted";
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 group outline-none">
                  <StageBadge stage={currentStage} />
                  <ChevronDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {CANDIDATE_STAGES.map((s) => (
                  <DropdownMenuItem
                    key={s}
                    className={s === currentStage ? "bg-muted" : ""}
                    onSelect={() => {
                      if (s !== currentStage) {
                        quickStage.mutate({ id: row.original.id, stage: s });
                      }
                    }}
                  >
                    <StageBadge stage={s} />
                    {s === currentStage && (
                      <span className="ml-auto text-xs text-muted-foreground">current</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
      { accessorKey: "date_sourced", header: "Date Sourced" },
      { accessorKey: "next_action", header: "Next Action" },
      {
        accessorKey: "next_action_date",
        header: "Next Action Date",
        cell: ({ getValue, row }) => {
          const date = getValue() as string | null;
          if (!date) return <span className="text-muted-foreground">—</span>;
          const urgency = getRowUrgency(row.original);
          return (
            <span className={`flex items-center gap-1 whitespace-nowrap ${urgency === "overdue" ? "text-red-600 font-medium" : urgency === "today" ? "text-amber-600 font-medium" : ""}`}>
              {(urgency === "overdue" || urgency === "today") && (
                <AlertCircle className="h-3 w-3 shrink-0" />
              )}
              {date}
            </span>
          );
        },
      },
      { accessorKey: "status_comment", header: "Status / Comment" },
      {
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => openEdit(row.original)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteId(row.original.id)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filteredCandidates,
    columns,
    state: { sorting, globalFilter: search },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: "includesString",
  });

  const overdueCount = useMemo(
    () => candidates.filter((c) => getRowUrgency(c) === "overdue").length,
    [candidates],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Candidate Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Live pipeline of active candidates. Remove rows when rejected or joined.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" /> Add Candidate
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Candidate" : "Add Candidate"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
              <Field label="Client Name">
                <Input
                  value={form.client_name}
                  onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                />
              </Field>
              <Field label="Position Name">
                <Input
                  value={form.position_name}
                  onChange={(e) => setForm({ ...form, position_name: e.target.value })}
                />
              </Field>
              <Field label="Location">
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </Field>
              <Field label="CTC">
                <Input
                  value={form.ctc}
                  onChange={(e) => setForm({ ...form, ctc: e.target.value })}
                />
              </Field>
              <Field label="Candidate Name">
                <Input
                  value={form.candidate_name}
                  onChange={(e) => setForm({ ...form, candidate_name: e.target.value })}
                />
              </Field>
              <Field label="CRM Owner">
                <RecruiterCombobox
                  value={form.crm_owner}
                  onChange={(v) => setForm({ ...form, crm_owner: v })}
                  options={activeNames}
                  allowClear
                  placeholder="Select CRM owner…"
                />
              </Field>
              <Field label="Source Recruiter">
                <RecruiterCombobox
                  value={form.source_recruiter}
                  onChange={(v) => setForm({ ...form, source_recruiter: v })}
                  options={activeNames}
                  allowClear
                  placeholder="Select source recruiter…"
                />
              </Field>
              <Field label="Stage">
                <Select
                  value={form.stage}
                  onValueChange={(v) => setForm({ ...form, stage: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CANDIDATE_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Date Sourced">
                <Input
                  type="date"
                  value={form.date_sourced}
                  onChange={(e) => setForm({ ...form, date_sourced: e.target.value })}
                />
              </Field>
              <Field label="Next Action">
                <Input
                  value={form.next_action}
                  onChange={(e) => setForm({ ...form, next_action: e.target.value })}
                />
              </Field>
              <Field label="Next Action Date">
                <Input
                  type="date"
                  value={form.next_action_date}
                  onChange={(e) => setForm({ ...form, next_action_date: e.target.value })}
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Status / Comment">
                  <Textarea
                    rows={3}
                    value={form.status_comment}
                    onChange={(e) => setForm({ ...form, status_comment: e.target.value })}
                  />
                </Field>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save Candidate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {overdueCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {overdueCount} candidate{overdueCount > 1 ? "s have" : " has"} an overdue next action.
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Search candidates, clients, positions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {CANDIDATE_STAGES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {table.getFilteredRowModel().rows.length} candidate{table.getFilteredRowModel().rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((h) => {
                      const canSort = h.column.getCanSort();
                      return (
                        <TableHead key={h.id} className="whitespace-nowrap">
                          {canSort ? (
                            <button
                              className="inline-flex items-center gap-1 hover:text-foreground"
                              onClick={h.column.getToggleSortingHandler()}
                            >
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              <ArrowUpDown className="h-3 w-3 opacity-60" />
                            </button>
                          ) : (
                            flexRender(h.column.columnDef.header, h.getContext())
                          )}
                        </TableHead>
                      );
                    })}
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
                      No candidates found. {stageFilter !== "all" ? "Try clearing the stage filter." : "Add one to get started."}
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => {
                    const urgency = getRowUrgency(row.original);
                    return (
                      <TableRow key={row.id} className={urgencyRowClass[urgency]}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="whitespace-nowrap">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this candidate?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the row from the live pipeline. Use this when the
              candidate is rejected or has joined.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && remove.mutate(deleteId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
