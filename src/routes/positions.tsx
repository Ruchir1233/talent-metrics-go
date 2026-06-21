import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
  const [editingCountId, setEditingCountId] = useState<string | null>(null);
  const [countInput, setCountInput] = useState("");

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
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "TOTAL POSITIONS", value: positions.length,  color: "text-[#111827]" },
          { label: "OPEN POSITIONS",  value: openCount,         color: "text-[#10b981]" },
          { label: "SHARED WITH SURAT", value: suratCount,      color: "text-[#6366f1]" },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-[#e5e7eb] rounded-xl p-5">
            <div className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider mb-2">{s.label}</div>
            <div className={`text-[32px] font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 bg-white border border-[#e5e7eb] rounded-xl px-4 py-3">
        <input
          type="text"
          placeholder="Search client or position..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 text-[14px] text-[#374151] bg-transparent outline-none placeholder-[#d1d5db]"
        />
        <span className="text-[13px] text-[#9ca3af] shrink-0">{filtered.length} positions</span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#fafafa]">
                  <TableHead className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider">Client</TableHead>
                  <TableHead className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider">Position</TableHead>
                  <TableHead className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider">Location</TableHead>
                  <TableHead className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider">CTC</TableHead>
                  <TableHead className="text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider">Candidates</TableHead>
                  <TableHead className="text-right text-[11px] font-bold text-[#9ca3af] uppercase tracking-wider"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-16">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="text-4xl">📋</div>
                      <div className="text-sm font-medium">No positions yet</div>
                      <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1.5" />Create First Position</Button>
                    </div>
                  </TableCell></TableRow>
                ) : (
                  filtered.map((p) => (
                    <TableRow key={p.id} className="hover:bg-[#fafafa] transition-colors">
                      <TableCell className="font-semibold text-[#111827]">{p.client_name}</TableCell>
                      <TableCell className="font-medium text-[#374151]">{p.position_name}</TableCell>
                      <TableCell className="text-[#9ca3af]">{p.location ?? "—"}</TableCell>
                      <TableCell className="text-[#9ca3af]">{p.ctc ?? "—"}</TableCell>
                      <TableCell>
                        {p.shared_with_surat ? (
                          editingCountId === p.id ? (
                            <input
                              type="number"
                              min="0"
                              autoFocus
                              value={countInput}
                              onChange={(e) => setCountInput(e.target.value)}
                              onBlur={() => {
                                const n = parseInt(countInput, 10);
                                if (!isNaN(n) && n >= 0) updateSuratCount.mutate({ id: p.id, count: n });
                                setEditingCountId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const n = parseInt(countInput, 10);
                                  if (!isNaN(n) && n >= 0) updateSuratCount.mutate({ id: p.id, count: n });
                                  setEditingCountId(null);
                                }
                                if (e.key === "Escape") setEditingCountId(null);
                              }}
                              className="w-16 text-center font-semibold text-[#111827] border border-[#6366f1] rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-[#6366f1]/20"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setEditingCountId(p.id); setCountInput(String(p.surat_cv_count || 0)); }}
                              className="font-semibold text-[#111827] hover:text-[#6366f1] hover:underline cursor-pointer transition-colors"
                              title="Click to edit"
                            >
                              {p.surat_cv_count || 0}
                            </button>
                          )
                        ) : (
                          <span className="font-semibold text-[#111827]">{candidateCounts[p.id] ?? 0}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => remove.mutate(p.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
