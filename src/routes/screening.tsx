import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Plus, Phone, Pencil, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/screening")({
  head: () => ({ meta: [{ title: "Screening — Kaapro" }] }),
  component: ScreeningPage,
});

const CANDIDATE_STAGES = [
  { value: "call_pending",     label: "Call Pending",      color: "bg-gray-100 text-gray-600" },
  { value: "shortlisted",      label: "Shortlisted",       color: "bg-blue-100 text-blue-700" },
  { value: "interested",       label: "Interested",        color: "bg-green-100 text-green-700" },
  { value: "sent_to_client",   label: "Sent to Client",    color: "bg-purple-100 text-purple-700" },
  { value: "not_interested",   label: "Not Interested",    color: "bg-red-100 text-red-600" },
  { value: "not_responding",   label: "Not Responding",    color: "bg-orange-100 text-orange-600" },
  { value: "high_budget",      label: "High Budget",       color: "bg-yellow-100 text-yellow-700" },
  { value: "future",           label: "Future",            color: "bg-teal-100 text-teal-700" },
] as const;

type StageValue = typeof CANDIDATE_STAGES[number]["value"];

type ScreeningCandidate = {
  id: string;
  position_id: string;
  name: string;
  phone: string | null;
  company: string | null;
  current_ctc: string | null;
  expectation: string | null;
  notes: string | null;
  stage: StageValue;
  created_at: string;
};

type CandidateForm = {
  name: string;
  phone: string;
  company: string;
  current_ctc: string;
  expectation: string;
  notes: string;
  stage: StageValue;
};

const emptyForm = (): CandidateForm => ({
  name: "", phone: "", company: "", current_ctc: "",
  expectation: "", notes: "", stage: "call_pending",
});

function stageInfo(stage: StageValue) {
  return CANDIDATE_STAGES.find(s => s.value === stage) ?? CANDIDATE_STAGES[0];
}

function ScreeningPage() {
  const qc = useQueryClient();
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editCandidate, setEditCandidate] = useState<ScreeningCandidate | null>(null);
  const [form, setForm] = useState<CandidateForm>(emptyForm());
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState<string>("");
  const noteInputRef = useRef<HTMLInputElement>(null);

  // Fetch open/on-hold positions
  const { data: positions = [] } = useQuery({
    queryKey: ["positions_screening"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("id, client_name, position_name, location, ctc, status")
        .in("status", ["Open", "On Hold"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch candidates for selected position
  const { data: candidates = [], isLoading: candidatesLoading } = useQuery({
    queryKey: ["screening_candidates", selectedPositionId],
    queryFn: async () => {
      if (!selectedPositionId) return [];
      const { data, error } = await supabase
        .from("screening_candidates")
        .select("*")
        .eq("position_id", selectedPositionId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ScreeningCandidate[];
    },
    enabled: !!selectedPositionId,
  });

  // Realtime: refresh candidates when any change happens in Supabase
  useEffect(() => {
    if (!selectedPositionId) return;
    const channel = supabase
      .channel(`screening_candidates_${selectedPositionId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "screening_candidates",
        filter: `position_id=eq.${selectedPositionId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ["screening_candidates", selectedPositionId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedPositionId, qc]);

  // Focus note input when editing starts
  useEffect(() => {
    if (editingNoteId && noteInputRef.current) noteInputRef.current.focus();
  }, [editingNoteId]);

  const selectedPosition = positions.find(p => p.id === selectedPositionId);

  const filteredCandidates = stageFilter === "all"
    ? candidates
    : candidates.filter(c => c.stage === stageFilter);

  // Counts per stage for the selected position
  const stageCounts = CANDIDATE_STAGES.map(s => ({
    ...s,
    count: candidates.filter(c => c.stage === s.value).length,
  }));

  const addCandidate = useMutation({
    mutationFn: async () => {
      if (!selectedPositionId) throw new Error("No position selected");
      if (!form.name.trim()) throw new Error("Name is required");
      const { error } = await supabase.from("screening_candidates").insert({
        position_id: selectedPositionId,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        company: form.company.trim() || null,
        current_ctc: form.current_ctc.trim() || null,
        expectation: form.expectation.trim() || null,
        notes: form.notes.trim() || null,
        stage: form.stage,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidate added");
      qc.invalidateQueries({ queryKey: ["screening_candidates", selectedPositionId] });
      setAddOpen(false);
      setForm(emptyForm());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateCandidate = useMutation({
    mutationFn: async () => {
      if (!editCandidate) return;
      if (!form.name.trim()) throw new Error("Name is required");
      const { error } = await supabase.from("screening_candidates").update({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        company: form.company.trim() || null,
        current_ctc: form.current_ctc.trim() || null,
        expectation: form.expectation.trim() || null,
        notes: form.notes.trim() || null,
        stage: form.stage,
      }).eq("id", editCandidate.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidate updated");
      qc.invalidateQueries({ queryKey: ["screening_candidates", selectedPositionId] });
      setEditCandidate(null);
      setForm(emptyForm());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: StageValue }) => {
      const { error } = await supabase.from("screening_candidates")
        .update({ stage })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["screening_candidates", selectedPositionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCandidate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("screening_candidates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Candidate removed");
      qc.invalidateQueries({ queryKey: ["screening_candidates", selectedPositionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveNote = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase.from("screening_candidates")
        .update({ notes: notes.trim() || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["screening_candidates", selectedPositionId] });
      setEditingNoteId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openAdd = () => {
    setForm(emptyForm());
    setAddOpen(true);
  };

  const openEdit = (c: ScreeningCandidate) => {
    setEditCandidate(c);
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      company: c.company ?? "",
      current_ctc: c.current_ctc ?? "",
      expectation: c.expectation ?? "",
      notes: c.notes ?? "",
      stage: c.stage,
    });
  };

  return (
    <div className="flex h-[calc(100vh-2rem)] gap-0 -m-6 overflow-hidden">

      {/* LEFT: Position list */}
      <div className="w-[260px] shrink-0 border-r border-[#e5e7eb] bg-[#f9fafb] flex flex-col overflow-hidden">
        <div className="px-4 pt-5 pb-3 border-b border-[#e5e7eb]">
          <h2 className="text-[15px] font-bold text-[#111827]">Positions</h2>
          <p className="text-[11px] text-[#9ca3af] mt-0.5">Open & On Hold</p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {positions.length === 0 ? (
            <div className="px-4 py-6 text-[13px] text-[#9ca3af] text-center">No open positions</div>
          ) : positions.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setSelectedPositionId(p.id); setStageFilter("all"); }}
              className={`w-full text-left px-4 py-3 border-b border-[#f3f4f6] transition-colors ${
                selectedPositionId === p.id
                  ? "bg-[#eef2ff] border-l-2 border-l-[#6366f1]"
                  : "hover:bg-white"
              }`}
            >
              <div className="text-[13px] font-semibold text-[#111827] truncate">{p.position_name}</div>
              <div className="text-[11px] text-[#6b7280] truncate mt-0.5">{p.client_name}</div>
              {p.location && <div className="text-[11px] text-[#9ca3af] truncate">{p.location}</div>}
              <div className={`inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                p.status === "Open" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
              }`}>{p.status}</div>
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT: Candidates panel */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        {!selectedPosition ? (
          <div className="flex-1 flex items-center justify-center text-[#9ca3af]">
            <div className="text-center">
              <div className="text-4xl mb-3">👈</div>
              <div className="text-[15px] font-medium">Select a position to view candidates</div>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#e5e7eb] flex items-start justify-between gap-4">
              <div>
                <h1 className="text-[18px] font-bold text-[#111827]">{selectedPosition.position_name}</h1>
                <div className="text-[13px] text-[#6b7280] mt-0.5">
                  {selectedPosition.client_name}
                  {selectedPosition.location && ` · ${selectedPosition.location}`}
                  {selectedPosition.ctc && ` · ${selectedPosition.ctc}`}
                </div>
              </div>
              <Button onClick={openAdd} size="sm" className="shrink-0">
                <Plus className="h-4 w-4 mr-1" /> Add Candidate
              </Button>
            </div>

            {/* Stage pill filters */}
            <div className="px-6 py-3 border-b border-[#f3f4f6] flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setStageFilter("all")}
                className={`text-[12px] px-3 py-1 rounded-full font-medium transition-colors ${
                  stageFilter === "all" ? "bg-[#111827] text-white" : "bg-[#f3f4f6] text-[#6b7280] hover:bg-[#e5e7eb]"
                }`}
              >
                All ({candidates.length})
              </button>
              {stageCounts.filter(s => s.count > 0).map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStageFilter(stageFilter === s.value ? "all" : s.value)}
                  className={`text-[12px] px-3 py-1 rounded-full font-medium transition-colors ${
                    stageFilter === s.value ? "bg-[#111827] text-white" : `${s.color} hover:opacity-80`
                  }`}
                >
                  {s.label} ({s.count})
                </button>
              ))}
            </div>

            {/* Candidate list */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {candidatesLoading ? (
                <div className="text-center py-12 text-[#9ca3af]">Loading…</div>
              ) : filteredCandidates.length === 0 ? (
                <div className="text-center py-12 text-[#9ca3af]">
                  {candidates.length === 0
                    ? "No candidates yet. Click \"Add Candidate\" to start."
                    : "No candidates in this stage."}
                </div>
              ) : filteredCandidates.map((c, idx) => (
                <div key={c.id} className="group border border-[#e5e7eb] rounded-xl px-4 py-3.5 hover:border-[#d1d5db] hover:shadow-sm transition-all bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Index number */}
                      <div className="w-6 h-6 rounded-full bg-[#f3f4f6] flex items-center justify-center text-[11px] font-bold text-[#9ca3af] shrink-0 mt-0.5">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[15px] font-semibold text-[#111827]">{c.name}</span>
                          {c.phone && (
                            <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-[12px] text-[#6366f1] hover:underline">
                              <Phone className="h-3 w-3" />{c.phone}
                            </a>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[12px] text-[#6b7280]">
                          {c.company && <span>🏢 {c.company}</span>}
                          {c.current_ctc && <span>💰 Current: {c.current_ctc}</span>}
                          {c.expectation && <span>🎯 Exp: {c.expectation}</span>}
                        </div>
                        {/* Inline notes edit */}
                        {editingNoteId === c.id ? (
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <input
                              ref={noteInputRef}
                              value={noteValue}
                              onChange={e => setNoteValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") saveNote.mutate({ id: c.id, notes: noteValue });
                                if (e.key === "Escape") setEditingNoteId(null);
                              }}
                              onBlur={() => saveNote.mutate({ id: c.id, notes: noteValue })}
                              placeholder="Add a note…"
                              className="flex-1 text-[12px] border border-[#d1d5db] rounded-md px-2 py-1 outline-none focus:border-[#6366f1] bg-white"
                            />
                          </div>
                        ) : (
                          <div
                            className="mt-1.5 text-[12px] text-[#6b7280] italic cursor-text hover:text-[#374151] min-h-[18px]"
                            onClick={() => { setEditingNoteId(c.id); setNoteValue(c.notes ?? ""); }}
                            title="Click to edit note"
                          >
                            {c.notes ? `"${c.notes}"` : <span className="not-italic text-[#d1d5db] opacity-0 group-hover:opacity-100">+ add note</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stage dropdown + actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Select
                        value={c.stage}
                        onValueChange={(v) => updateStage.mutate({ id: c.id, stage: v as StageValue })}
                      >
                        <SelectTrigger className={`h-7 text-[11px] font-semibold border-0 px-2.5 rounded-full w-auto ${stageInfo(c.stage).color}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CANDIDATE_STAGES.map(s => (
                            <SelectItem key={s.value} value={s.value}>
                              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="p-1.5 rounded-lg hover:bg-[#f3f4f6] text-[#9ca3af] hover:text-[#374151]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { if (confirm(`Remove ${c.name}?`)) deleteCandidate.mutate(c.id); }}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-[#9ca3af] hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add Candidate Dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) { setAddOpen(false); setForm(emptyForm()); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Candidate</DialogTitle></DialogHeader>
          <CandidateFormFields form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setAddOpen(false); setForm(emptyForm()); }}>Cancel</Button>
            <Button onClick={() => addCandidate.mutate()} disabled={addCandidate.isPending}>
              {addCandidate.isPending ? "Adding…" : "Add Candidate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Candidate Dialog */}
      <Dialog open={!!editCandidate} onOpenChange={(o) => { if (!o) { setEditCandidate(null); setForm(emptyForm()); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Candidate</DialogTitle></DialogHeader>
          <CandidateFormFields form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setEditCandidate(null); setForm(emptyForm()); }}>Cancel</Button>
            <Button onClick={() => updateCandidate.mutate()} disabled={updateCandidate.isPending}>
              {updateCandidate.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CandidateFormFields({
  form, setForm,
}: { form: CandidateForm; setForm: (f: CandidateForm) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 py-2">
      <div className="col-span-2 space-y-1">
        <Label className="text-xs">Name *</Label>
        <Input placeholder="Mayur Suryavanshi" value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Phone</Label>
        <Input placeholder="9265211257" value={form.phone}
          onChange={e => setForm({ ...form, phone: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Company</Label>
        <Input placeholder="Bavda FMCG" value={form.company}
          onChange={e => setForm({ ...form, company: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Current CTC / Salary</Label>
        <Input placeholder="32k / 4.5 LPA" value={form.current_ctc}
          onChange={e => setForm({ ...form, current_ctc: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Expectation</Label>
        <Input placeholder="30% hike / 6 LPA" value={form.expectation}
          onChange={e => setForm({ ...form, expectation: e.target.value })} />
      </div>
      <div className="col-span-2 space-y-1">
        <Label className="text-xs">Stage</Label>
        <Select value={form.stage} onValueChange={v => setForm({ ...form, stage: v as StageValue })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CANDIDATE_STAGES.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
