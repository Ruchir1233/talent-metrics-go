import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase, type Position } from "@/lib/supabase";

export const Route = createFileRoute("/positions")({
  head: () => ({ meta: [{ title: "Positions — Kaapro" }] }),
  component: PositionsPage,
});

type FormState = {
  client_name: string;
  position_name: string;
  location: string;
  ctc: string;
  description: string;
  status: "Open" | "On Hold" | "Closed";
  shared_with_surat: boolean;
  surat_recruiter_name: string;
  date_opened: string;
};

const emptyForm = (): FormState => ({
  client_name: "",
  position_name: "",
  location: "",
  ctc: "",
  description: "",
  status: "Open",
  shared_with_surat: false,
  surat_recruiter_name: "",
  date_opened: new Date().toISOString().slice(0, 10),
});

const STATUS_COLORS: Record<string, string> = {
  Open: "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400",
  "On Hold": "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  Closed: "border-muted text-muted-foreground",
};

function PositionsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: positions = [], isLoading } = useQuery({
    queryKey: ["positions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Position[];
    },
  });

  // Candidate counts per position
  const { data: candidateCounts = {} } = useQuery({
    queryKey: ["candidates", "counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates").select("position_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const c of data ?? []) {
        if (c.position_id) counts[c.position_id] = (counts[c.position_id] ?? 0) + 1;
      }
      return counts;
    },
  });

  const filtered = useMemo(() => {
    return positions.filter((p) => {
      const matchSearch = search === "" ||
        p.client_name.toLowerCase().includes(search.toLowerCase()) ||
        p.position_name.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || p.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [positions, search, statusFilter]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.client_name.trim()) throw new Error("Client name is required");
      if (!form.position_name.trim()) throw new Error("Position name is required");
      const payload = {
        client_name: form.client_name.trim(),
        position_name: form.position_name.trim(),
        location: form.location.trim() || null,
        ctc: form.ctc.trim() || null,
        description: form.description.trim() || null,
        status: form.status,
        shared_with_surat: form.shared_with_surat,
        surat_recruiter_name: form.shared_with_surat ? (form.surat_recruiter_name.trim() || null) : null,
        date_opened: form.date_opened || null,
      };
      if (editingId) {
        const { error } = await supabase.from("positions").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("positions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Position updated" : "Position created");
      qc.invalidateQueries({ queryKey: ["positions"] });
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("positions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Position deleted");
      qc.invalidateQueries({ queryKey: ["positions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openAdd = () => { setEditingId(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (p: Position) => {
    setEditingId(p.id);
    setForm({
      client_name: p.client_name,
      position_name: p.position_name,
      location: p.location ?? "",
      ctc: p.ctc ?? "",
      description: p.description ?? "",
      status: p.status,
      shared_with_surat: p.shared_with_surat,
      surat_recruiter_name: p.surat_recruiter_name ?? "",
      date_opened: p.date_opened ?? "",
    });
    setDialogOpen(true);
  };
  const closeDialog = () => { setDialogOpen(false); setEditingId(null); setForm(emptyForm()); };

  const openCount = positions.filter((p) => p.status === "Open").length;
  const suratCount = positions.filter((p) => p.shared_with_surat).length;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Positions</h1>
          <p className="text-sm text-muted-foreground">
            Master list of all positions. Candidates are linked to positions from here.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4 mr-2" /> New Position
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Total Positions</div>
          <div className="text-3xl font-semibold">{positions.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Open Positions</div>
          <div className="text-3xl font-semibold text-green-600">{openCount}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground mb-1">Shared with Surat</div>
          <div className="text-3xl font-semibold text-blue-600">{suratCount}</div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Search client or position…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Open">Open</SelectItem>
            <SelectItem value="On Hold">On Hold</SelectItem>
            <SelectItem value="Closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} positions</span>
      </div>

      {/* Table */}
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
                  <TableHead>Date Opened</TableHead>
                  <TableHead>Candidates</TableHead>
                  <TableHead>Surat</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="py-16">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="text-4xl">📋</div>
                      <div className="text-sm font-medium">No positions yet</div>
                      <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Create First Position</Button>
                    </div>
                  </TableCell></TableRow>
                ) : (
                  filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.client_name}</TableCell>
                      <TableCell>{p.position_name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.location ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{p.ctc ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{p.date_opened ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{candidateCounts[p.id] ?? 0}</Badge>
                      </TableCell>
                      <TableCell>
                        {p.shared_with_surat ? (
                          <Badge className="bg-blue-500/10 text-blue-700 border-blue-500/30 border">
                            <Share2 className="h-3 w-3 mr-1" /> Surat
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_COLORS[p.status]}>{p.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete position?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  "{p.position_name}" at {p.client_name} will be deleted. Existing candidates linked to it won't be deleted but will lose their position link.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove.mutate(p.id)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Position" : "New Position"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Client Name *">
                <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} placeholder="e.g. Hema Automation" />
              </Field>
              <Field label="Position Name *">
                <Input value={form.position_name} onChange={(e) => setForm({ ...form, position_name: e.target.value })} placeholder="e.g. Inside Sales" />
              </Field>
              <Field label="Location">
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Surat" />
              </Field>
              <Field label="CTC">
                <Input value={form.ctc} onChange={(e) => setForm({ ...form, ctc: e.target.value })} placeholder="e.g. 4-6 LPA" />
              </Field>
              <Field label="Date Opened">
                <Input type="date" value={form.date_opened} onChange={(e) => setForm({ ...form, date_opened: e.target.value })} />
              </Field>
              <Field label="Status">
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as FormState["status"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="On Hold">On Hold</SelectItem>
                    <SelectItem value="Closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Description">
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Job requirements, skills needed…" />
            </Field>
            <div className="rounded-lg border bg-blue-500/5 overflow-hidden">
              <div className="flex items-center justify-between p-3">
                <div>
                  <div className="text-sm font-medium">Share with Surat Team</div>
                  <div className="text-xs text-muted-foreground">Mark this position as shared with Surat-based recruiters</div>
                </div>
                <Switch
                  checked={form.shared_with_surat}
                  onCheckedChange={(v) => setForm({ ...form, shared_with_surat: v, surat_recruiter_name: v ? form.surat_recruiter_name : "" })}
                />
              </div>
              {form.shared_with_surat && (
                <div className="px-3 pb-3 pt-0 border-t border-blue-500/10">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Surat Recruiter Name</Label>
                  <Input
                    placeholder="e.g. Rajesh, Priya…"
                    value={form.surat_recruiter_name}
                    onChange={(e) => setForm({ ...form, surat_recruiter_name: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : editingId ? "Update Position" : "Create Position"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
