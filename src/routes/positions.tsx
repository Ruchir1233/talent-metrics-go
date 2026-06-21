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
import { supabase, type Position, type Recruiter } from "@/lib/supabase";

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
  recruiter_id: string;
  shared_with_surat: boolean;
  surat_recruiter_name: string;
};

const emptyForm = (): FormState => ({
  client_name: "",
  position_name: "",
  location: "",
  ctc: "",
  description: "",
  recruiter_id: "",
  shared_with_surat: false,
  surat_recruiter_name: "",
});

function PositionsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [search, setSearch] = useState("");

  const { data: positions = [], isLoading } = useQuery({
    queryKey: ["positions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Position[];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["recruiters", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recruiters").select("*").eq("active", true).order("name");
      if (error) throw error;
      return (data ?? []) as Recruiter[];
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
      return matchSearch;
    });
  }, [positions, search]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.client_name.trim()) throw new Error("Client name is required");
      if (!form.position_name.trim()) throw new Error("Position name is required");

      // Base payload without recruiter_id (added separately if column exists)
      const payload: Record<string, any> = {
        client_name: form.client_name.trim(),
        position_name: form.position_name.trim(),
        location: form.location.trim() || null,
        ctc: form.ctc.trim() || null,
        description: form.description.trim() || null,
        shared_with_surat: form.shared_with_surat,
        surat_recruiter_name: form.shared_with_surat ? (form.surat_recruiter_name.trim() || null) : null,
      };

      // Only include recruiter_id if a value is selected (column may not exist yet)
      if (!form.shared_with_surat && form.recruiter_id) {
        payload.recruiter_id = form.recruiter_id;
      }

      if (editingId) {
        const { error } = await supabase.from("positions").update(payload).eq("id", editingId);
        if (error && !error.message.includes("recruiter_id")) throw error;
        if (error) {
          // Column doesn't exist yet - save without it
          delete payload.recruiter_id;
          const { error: e2 } = await supabase.from("positions").update(payload).eq("id", editingId);
          if (e2) throw e2;
        }
      } else {
        const { error } = await supabase.from("positions").insert(payload);
        if (error && !error.message.includes("recruiter_id")) throw error;
        if (error) {
          delete payload.recruiter_id;
          const { error: e2 } = await supabase.from("positions").insert(payload);
          if (e2) throw e2;
        }
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

  const updateSuratCount = useMutation({
    mutationFn: async ({ id, count }: { id: string; count: number }) => {
      const { error } = await supabase.from("positions").update({ surat_cv_count: count }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Surat CV count updated");
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
      recruiter_id: (p as any).recruiter_id ?? "",
      shared_with_surat: p.shared_with_surat,
      surat_recruiter_name: p.surat_recruiter_name ?? "",
    });
    setDialogOpen(true);
  };
  const closeDialog = () => { setDialogOpen(false); setEditingId(null); setForm(emptyForm()); };

  const openCount = positions.filter((p) => !p.shared_with_surat).length;
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
                  <TableHead>Candidates</TableHead>
                  <TableHead>Surat</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-16">
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
                      <TableCell>
                        {p.shared_with_surat ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              className="w-6 h-6 rounded border text-muted-foreground hover:bg-muted flex items-center justify-center text-sm font-medium"
                              onClick={() => { const cur = p.surat_cv_count || 0; if (cur > 0) updateSuratCount.mutate({ id: p.id, count: cur - 1 }); }}
                            >−</button>
                            <span className="tabular-nums font-semibold w-6 text-center">{p.surat_cv_count || 0}</span>
                            <button
                              type="button"
                              className="w-6 h-6 rounded border text-muted-foreground hover:bg-muted flex items-center justify-center text-sm font-medium"
                              onClick={() => updateSuratCount.mutate({ id: p.id, count: (p.surat_cv_count || 0) + 1 })}
                            >+</button>
                            <span className="text-xs text-muted-foreground">Surat CVs</span>
                          </div>
                        ) : (
                          <Badge variant="secondary">{candidateCounts[p.id] ?? 0}</Badge>
                        )}
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
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o && dialogOpen) closeDialog(); }}>
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
            </div>
            <Field label="Description">
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Job requirements, skills needed…" />
            </Field>
            {!form.shared_with_surat && (
              <Field label="Recruiter">
                <Select value={form.recruiter_id || "none"} onValueChange={(v) => setForm({ ...form, recruiter_id: v === "none" ? "" : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select recruiter…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
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
