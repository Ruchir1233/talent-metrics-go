import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { Plus, Upload, Trash2, ChevronRight, Check, Pencil, ChevronLeft, Filter } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase, type ClientLead, type ContactList } from "@/lib/supabase";

export const Route = createFileRoute("/outreach/leads")({
  head: () => ({ meta: [{ title: "Leads — Kaapro Outreach" }] }),
  component: LeadsPage,
});

const STAGE_COLORS: Record<string, string> = {
  not_contacted:     "bg-gray-100 text-gray-600",
  email_sent:        "bg-blue-100 text-blue-700",
  opened:            "bg-amber-100 text-amber-700",
  replied:           "bg-purple-100 text-purple-700",
  interested:        "bg-green-100 text-green-700",
  meeting_scheduled: "bg-teal-100 text-teal-700",
  contacted:         "bg-blue-100 text-blue-700",
  client:            "bg-emerald-100 text-emerald-700",
  lost:              "bg-red-100 text-red-700",
  bounced:           "bg-red-200 text-red-800",
};

const ALL_STAGES = [
  { value: "all", label: "All Stages" },
  { value: "not_contacted", label: "Not Contacted" },
  { value: "contacted", label: "Contacted" },
  { value: "email_sent", label: "Email Sent" },
  { value: "opened", label: "Opened" },
  { value: "replied", label: "Replied" },
  { value: "interested", label: "Interested" },
  { value: "meeting_scheduled", label: "Meeting Scheduled" },
  { value: "client", label: "Client" },
  { value: "bounced", label: "Bounced" },
  { value: "lost", label: "Lost" },
];

const INDUSTRIES = [
  "IT / Software", "Manufacturing", "Automobile", "Pharmaceutical",
  "Healthcare", "FMCG / Retail", "Banking / Finance", "Insurance",
  "Real Estate", "Construction", "Education", "Logistics / Supply Chain",
  "Telecom", "Media / Advertising", "Hospitality / Tourism",
  "Textile / Apparel", "Chemical", "Agriculture", "E-commerce",
  "Consulting", "Legal", "Engineering Services", "Energy / Power",
  "Food & Beverage", "Contract Staffing", "Others",
] as const;

const DB_FIELDS = ["company_name", "person_name", "email", "phone", "industry", "location"] as const;
const DB_LABELS: Record<string, string> = {
  company_name: "Company Name",
  person_name:  "Person Name",
  email:        "Email *",
  phone:        "Phone",
  industry:     "Industry",
  location:     "Location",
};

type LeadForm = {
  list_id: string; company_name: string; person_name: string;
  email: string; phone: string; industry: string; location: string;
};

const emptyLead = (): LeadForm => ({
  list_id: "", company_name: "", person_name: "",
  email: "", phone: "", industry: "", location: "",
});

const PAGE_SIZE = 20;

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  for (const line of lines) {
    const row: string[] = [];
    let cur = "", inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        row.push(cur.trim()); cur = "";
      } else {
        cur += ch;
      }
    }
    row.push(cur.trim());
    rows.push(row);
  }
  return rows;
}

function LeadsPage() {
  const qc = useQueryClient();
  const [selectedList, setSelectedList] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [leadForm, setLeadForm] = useState<LeadForm>(emptyLead());

  // Rename list state
  const [renamingListId, setRenamingListId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Multi-select state
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [bulkListId, setBulkListId] = useState<string>("");
  const [bulkListDialogOpen, setBulkListDialogOpen] = useState(false);

  // CSV Import state
  const [csvStep, setCsvStep] = useState(1);
  const [csvListName, setCsvListName] = useState("");
  const [csvListId, setCsvListId] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [customIndustry, setCustomIndustry] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editingLead, setEditingLead] = useState<ClientLead | null>(null);
  const [editForm, setEditForm] = useState<LeadForm>(emptyLead());
  const [assigningLeadId, setAssigningLeadId] = useState<string | null>(null);
  const [assignListId, setAssignListId] = useState<string>("");

  const { data: lists = [] } = useQuery({
    queryKey: ["contact_lists"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contact_lists").select("*, client_leads(count)").order("name");
      if (error) throw error;
      return (data ?? []) as (ContactList & { client_leads: { count: number }[] })[];
    },
  });

  const { data: allLeads = [], isLoading } = useQuery({
    queryKey: ["client_leads", selectedList, search],
    queryFn: async () => {
      let q = supabase.from("client_leads").select("*");
      if (selectedList !== "all") q = q.eq("list_id", selectedList);
      if (search) q = q.or(`company_name.ilike.%${search}%,person_name.ilike.%${search}%,email.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ClientLead[];
    },
  });

  // Sort: contacted goes last; apply stage filter; then paginate
  const filteredLeads = allLeads
    .filter(l => stageFilter === "all" || l.pipeline_stage === stageFilter)
    .sort((a, b) => {
      const aContacted = a.pipeline_stage === "contacted";
      const bContacted = b.pipeline_stage === "contacted";
      if (aContacted && !bContacted) return 1;
      if (!aContacted && bContacted) return -1;
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const leads = filteredLeads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filter changes
  const setListAndReset = (v: string) => { setSelectedList(v); setPage(1); setSelectedLeadIds(new Set()); };
  const setStageAndReset = (v: string) => { setStageFilter(v); setPage(1); setSelectedLeadIds(new Set()); };
  const setSearchAndReset = (v: string) => { setSearch(v); setPage(1); setSelectedLeadIds(new Set()); };

  const allOnPageSelected = leads.length > 0 && leads.every(l => selectedLeadIds.has(l.id));
  const someSelected = selectedLeadIds.size > 0;

  const toggleLead = (id: string) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    if (allOnPageSelected) {
      setSelectedLeadIds(prev => {
        const next = new Set(prev);
        leads.forEach(l => next.delete(l.id));
        return next;
      });
    } else {
      setSelectedLeadIds(prev => {
        const next = new Set(prev);
        leads.forEach(l => next.add(l.id));
        return next;
      });
    }
  };

  const createList = useMutation({
    mutationFn: async (name: string) => {
      if (!name.trim()) throw new Error("List name required");
      const { data, error } = await supabase.from("contact_lists").insert({ name: name.trim() }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contact_lists"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameList = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      if (!name.trim()) throw new Error("List name required");
      const { error } = await supabase.from("contact_lists").update({ name: name.trim() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("List renamed");
      qc.invalidateQueries({ queryKey: ["contact_lists"] });
      // Also refresh campaigns since they show list names
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setRenamingListId(null);
      setRenameValue("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteList = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("client_leads").update({ list_id: null }).eq("list_id", id);
      const { error } = await supabase.from("contact_lists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("List deleted");
      setSelectedList("all");
      qc.invalidateQueries({ queryKey: ["contact_lists"] });
      qc.invalidateQueries({ queryKey: ["client_leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addLead = useMutation({
    mutationFn: async () => {
      if (!leadForm.email.trim()) throw new Error("Email required");
      const { error } = await supabase.from("client_leads").insert({
        list_id: leadForm.list_id || null,
        company_name: leadForm.company_name.trim() || null,
        person_name: leadForm.person_name.trim() || null,
        email: leadForm.email.trim(),
        phone: leadForm.phone.trim() || null,
        industry: leadForm.industry.trim() || null,
        location: leadForm.location.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead added");
      qc.invalidateQueries({ queryKey: ["client_leads"] });
      qc.invalidateQueries({ queryKey: ["contact_lists"] });
      setCustomIndustry("");
      setLeadForm({ ...emptyLead(), list_id: selectedList !== "all" ? selectedList : "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateLead = useMutation({
    mutationFn: async () => {
      if (!editForm.email.trim()) throw new Error("Email required");
      if (!editingLead) return;
      const { error } = await supabase.from("client_leads").update({
        company_name: editForm.company_name.trim() || null,
        person_name: editForm.person_name.trim() || null,
        email: editForm.email.trim(),
        phone: editForm.phone.trim() || null,
        industry: editForm.industry.trim() || null,
        location: editForm.location.trim() || null,
        list_id: editForm.list_id || null,
      }).eq("id", editingLead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead updated!");
      qc.invalidateQueries({ queryKey: ["client_leads"] });
      qc.invalidateQueries({ queryKey: ["contact_lists"] });
      setEditingLead(null);
      setEditForm(emptyLead());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignToList = useMutation({
    mutationFn: async ({ leadId, listId }: { leadId: string; listId: string }) => {
      const { error } = await supabase.from("client_leads")
        .update({ list_id: listId || null })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead added to list!");
      qc.invalidateQueries({ queryKey: ["client_leads"] });
      qc.invalidateQueries({ queryKey: ["contact_lists"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkAssignToList = useMutation({
    mutationFn: async (listId: string) => {
      const ids = Array.from(selectedLeadIds);
      if (ids.length === 0) throw new Error("No leads selected");
      const { error } = await supabase.from("client_leads")
        .update({ list_id: listId || null })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} lead${count > 1 ? "s" : ""} added to list!`);
      qc.invalidateQueries({ queryKey: ["client_leads"] });
      qc.invalidateQueries({ queryKey: ["contact_lists"] });
      setSelectedLeadIds(new Set());
      setBulkListDialogOpen(false);
      setBulkListId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("lead_notes").delete().eq("contact_id", id);
      await supabase.from("email_sends").delete().eq("contact_id", id);
      const { error } = await supabase.from("client_leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead deleted");
      qc.invalidateQueries({ queryKey: ["client_leads"] });
      qc.invalidateQueries({ queryKey: ["contact_lists"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) { toast.error("CSV must have at least 1 header row and 1 data row"); return; }
      const headers = rows[0];
      const dataRows = rows.slice(1).filter(r => r.some(c => c));
      setCsvHeaders(headers);
      setCsvRows(dataRows);
      const autoMap: Record<string, string> = {};
      for (const field of DB_FIELDS) {
        const match = headers.findIndex(h =>
          h.toLowerCase().replace(/[\s_-]/g, "") === field.toLowerCase().replace(/[\s_-]/g, "")
          || h.toLowerCase().includes(field.split("_")[0])
        );
        if (match >= 0) autoMap[field] = String(match);
      }
      setCsvMapping(autoMap);
      setCsvStep(2);
    };
    reader.readAsText(file);
  };

  const handleCsvImport = async () => {
    const emailColIdx = csvMapping["email"];
    if (!emailColIdx && emailColIdx !== "0") { toast.error("Email column mapping is required"); return; }
    setImporting(true);
    try {
      let listId = csvListId;
      if (!listId && csvListName.trim()) {
        const newList = await createList.mutateAsync(csvListName.trim());
        listId = newList.id;
        setCsvListId(listId);
      }
      const { data: existing } = await supabase.from("client_leads").select("email");
      const existingEmails = new Set((existing ?? []).map((r: any) => r.email.toLowerCase()));
      const toInsert = [];
      let skipped = 0;
      for (const row of csvRows) {
        const email = row[Number(csvMapping["email"])]?.trim();
        if (!email) { skipped++; continue; }
        if (existingEmails.has(email.toLowerCase())) { skipped++; continue; }
        toInsert.push({
          list_id: listId || null,
          email,
          company_name: csvMapping["company_name"] !== undefined ? row[Number(csvMapping["company_name"])]?.trim() || null : null,
          person_name:  csvMapping["person_name"]  !== undefined ? row[Number(csvMapping["person_name"])]?.trim()  || null : null,
          phone:        csvMapping["phone"]         !== undefined ? row[Number(csvMapping["phone"])]?.trim()         || null : null,
          industry:     csvMapping["industry"]      !== undefined ? row[Number(csvMapping["industry"])]?.trim()      || null : null,
          location:     csvMapping["location"]      !== undefined ? row[Number(csvMapping["location"])]?.trim()      || null : null,
        });
      }
      if (toInsert.length === 0) {
        toast.info(`No new leads to import. ${skipped} skipped (duplicates or missing email).`);
        setImporting(false); return;
      }
      for (let i = 0; i < toInsert.length; i += 100) {
        const { error } = await supabase.from("client_leads").insert(toInsert.slice(i, i + 100));
        if (error) throw error;
      }
      toast.success(`✅ Imported ${toInsert.length} leads! ${skipped > 0 ? `${skipped} skipped.` : ""}`);
      qc.invalidateQueries({ queryKey: ["client_leads"] });
      qc.invalidateQueries({ queryKey: ["contact_lists"] });
      setCsvDialogOpen(false);
      setCsvStep(1); setCsvListName(""); setCsvListId("");
      setCsvHeaders([]); setCsvRows([]); setCsvMapping({});
      if (listId) setListAndReset(listId);
    } catch (e: any) {
      toast.error("Import failed: " + e.message);
    }
    setImporting(false);
  };

  const resetCsvImport = () => {
    setCsvStep(1); setCsvListName(""); setCsvListId("");
    setCsvHeaders([]); setCsvRows([]); setCsvMapping({});
    if (fileRef.current) fileRef.current.value = "";
  };

  const previewRows = csvRows.slice(0, 5);
  const emailMapped = csvMapping["email"] !== undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Contact Lists</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Manage leads and contact lists for campaigns.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { resetCsvImport(); setCsvDialogOpen(true); }}>
            <Upload className="h-4 w-4 mr-1" /> Import CSV
          </Button>
          <Button variant="outline" onClick={() => setListDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New List
          </Button>
          <Button onClick={() => {
            setLeadForm({ ...emptyLead(), list_id: selectedList !== "all" ? selectedList : "" });
            setCustomIndustry("");
            setLeadDialogOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" /> Add Lead
          </Button>
        </div>
      </div>

      {/* List tabs */}
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => setListAndReset("all")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${selectedList === "all" ? "bg-[#6366f1] text-white border-[#6366f1]" : "border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]"}`}>
          All leads <span className="ml-1 opacity-70">({allLeads.length})</span>
        </button>
        {lists.map(l => (
          <div key={l.id} className="relative group/list flex items-center gap-1">
            {renamingListId === l.id ? (
              <div className="flex items-center gap-1">
                <Input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") renameList.mutate({ id: l.id, name: renameValue });
                    if (e.key === "Escape") { setRenamingListId(null); setRenameValue(""); }
                  }}
                  className="h-7 w-40 text-sm px-2"
                />
                <button
                  type="button"
                  onClick={() => renameList.mutate({ id: l.id, name: renameValue })}
                  className="p-1 rounded bg-[#6366f1] text-white text-xs px-2 h-7"
                  disabled={renameList.isPending}
                >✓</button>
                <button
                  type="button"
                  onClick={() => { setRenamingListId(null); setRenameValue(""); }}
                  className="p-1 rounded hover:bg-[#f3f4f6] text-[#9ca3af] text-xs h-7"
                >✕</button>
              </div>
            ) : (
              <>
                <button type="button" onClick={() => setListAndReset(l.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${selectedList === l.id ? "bg-[#6366f1] text-white border-[#6366f1]" : "border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]"}`}>
                  {l.name} <span className="ml-1 opacity-70">({l.client_leads?.[0]?.count ?? 0})</span>
                </button>
                <button
                  type="button"
                  title="Rename list"
                  onClick={() => { setRenamingListId(l.id); setRenameValue(l.name); }}
                  className="opacity-0 group-hover/list:opacity-100 p-1 rounded hover:bg-[#eef2ff] text-[#9ca3af] hover:text-[#6366f1] transition-all"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title="Delete list"
                  onClick={() => { if (confirm(`Delete list "${l.name}"? Leads will be kept but unassigned.`)) deleteList.mutate(l.id); }}
                  className="opacity-0 group-hover/list:opacity-100 p-1 rounded hover:bg-red-50 text-[#9ca3af] hover:text-red-500 transition-all"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Search + Stage filter row */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input placeholder="Search by company, name, email…" value={search}
          onChange={e => setSearchAndReset(e.target.value)} className="max-w-sm" />
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[#9ca3af]" />
          <Select value={stageFilter} onValueChange={setStageAndReset}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              {ALL_STAGES.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {someSelected && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-[#6b7280]">{selectedLeadIds.size} selected</span>
            <Button size="sm" variant="outline" onClick={() => { setBulkListId(""); setBulkListDialogOpen(true); }}>
              📋 Add to List
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedLeadIds(new Set())}>
              Clear
            </Button>
          </div>
        )}
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#f9fafb]">
              <TableHead className="w-10">
                <Checkbox
                  checked={allOnPageSelected}
                  onCheckedChange={toggleAllOnPage}
                  aria-label="Select all on page"
                />
              </TableHead>
              <TableHead className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Company</TableHead>
              <TableHead className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Contact</TableHead>
              <TableHead className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Email</TableHead>
              <TableHead className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Industry</TableHead>
              <TableHead className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Stage</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-[#9ca3af]">Loading…</TableCell></TableRow>
            ) : leads.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-[#9ca3af]">No leads found. Import a CSV or add manually.</TableCell></TableRow>
            ) : leads.map(l => (
              <TableRow key={l.id} className={`group hover:bg-[#fafafa] ${selectedLeadIds.has(l.id) ? "bg-[#eef2ff]" : ""}`}>
                <TableCell>
                  <Checkbox
                    checked={selectedLeadIds.has(l.id)}
                    onCheckedChange={() => toggleLead(l.id)}
                  />
                </TableCell>
                <TableCell className="font-medium text-[#111827]">{l.company_name ?? "—"}</TableCell>
                <TableCell className="text-[#374151]">{l.person_name ?? "—"}</TableCell>
                <TableCell className="text-[#6b7280] text-sm">{l.email}</TableCell>
                <TableCell className="text-[#6b7280] text-sm">{l.industry ?? "—"}</TableCell>
                <TableCell>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STAGE_COLORS[l.pipeline_stage] ?? "bg-gray-100 text-gray-600"}`}>
                    {l.pipeline_stage.replace(/_/g, " ")}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    {assigningLeadId === l.id ? (
                      <div className="flex items-center gap-1">
                        <select
                          autoFocus
                          value={assignListId}
                          onChange={e => setAssignListId(e.target.value)}
                          className="text-xs border border-[#e5e7eb] rounded px-1.5 py-1 text-[#374151] focus:outline-none focus:border-[#6366f1]"
                        >
                          <option value="">No list</option>
                          {lists.map(lst => <option key={lst.id} value={lst.id}>{lst.name}</option>)}
                        </select>
                        <button type="button"
                          onClick={() => { assignToList.mutate({ leadId: l.id, listId: assignListId }); setAssigningLeadId(null); setAssignListId(""); }}
                          className="p-1 rounded bg-[#6366f1] text-white text-xs px-2">Save</button>
                        <button type="button"
                          onClick={() => { setAssigningLeadId(null); setAssignListId(""); }}
                          className="p-1 rounded hover:bg-[#f3f4f6] text-[#9ca3af] text-xs">✕</button>
                      </div>
                    ) : (
                      <>
                        <button type="button"
                          onClick={() => { setEditingLead(l); setEditForm({ list_id: l.list_id ?? "", company_name: l.company_name ?? "", person_name: l.person_name ?? "", email: l.email, phone: l.phone ?? "", industry: l.industry ?? "", location: l.location ?? "" }); }}
                          className="p-1 rounded hover:bg-[#f3f4f6] text-[#9ca3af] hover:text-[#374151] transition-colors" title="Edit lead">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button"
                          onClick={() => { setAssigningLeadId(l.id); setAssignListId(l.list_id ?? ""); }}
                          className="p-1 rounded hover:bg-[#eef2ff] text-[#9ca3af] hover:text-[#6366f1] transition-colors text-xs" title="Add to list">
                          📋
                        </button>
                        <button type="button" onClick={() => deleteLead.mutate(l.id)}
                          className="p-1 rounded hover:bg-red-50 text-[#9ca3af] hover:text-red-500 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-[#6b7280]">
          <span>
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filteredLeads.length)} of {filteredLeads.length} leads
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (page <= 4) {
                pageNum = i + 1;
              } else if (page >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <button key={pageNum} type="button"
                  onClick={() => setPage(pageNum)}
                  className={`w-8 h-8 rounded text-sm font-medium transition-colors ${page === pageNum ? "bg-[#6366f1] text-white" : "hover:bg-[#f3f4f6] text-[#374151]"}`}>
                  {pageNum}
                </button>
              );
            })}
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* New List Dialog */}
      <Dialog open={listDialogOpen} onOpenChange={setListDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Contact List</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label>List Name</Label>
            <Input placeholder="e.g. IT Companies Mumbai" value={newListName} onChange={e => setNewListName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { createList.mutateAsync(newListName).then(() => { toast.success("List created"); setListDialogOpen(false); setNewListName(""); }); } }} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setListDialogOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              await createList.mutateAsync(newListName);
              toast.success("List created");
              setListDialogOpen(false); setNewListName("");
            }} disabled={createList.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Add to List Dialog */}
      <Dialog open={bulkListDialogOpen} onOpenChange={setBulkListDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add {selectedLeadIds.size} Lead{selectedLeadIds.size > 1 ? "s" : ""} to List</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Select List</Label>
            <Select value={bulkListId} onValueChange={setBulkListId}>
              <SelectTrigger><SelectValue placeholder="Choose a list…" /></SelectTrigger>
              <SelectContent>
                {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.name} ({l.client_leads?.[0]?.count ?? 0})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkListDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => bulkAssignToList.mutate(bulkListId)} disabled={!bulkListId || bulkAssignToList.isPending}>
              {bulkAssignToList.isPending ? "Adding…" : "Add to List"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Lead Dialog */}
      <Dialog open={leadDialogOpen} onOpenChange={(o) => { if (!o) { setLeadDialogOpen(false); setLeadForm(emptyLead()); setCustomIndustry(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Lead</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            {[
              { label: "Company Name", key: "company_name", placeholder: "Acme Corp" },
              { label: "Contact Name", key: "person_name", placeholder: "John Doe" },
              { label: "Email *", key: "email", placeholder: "john@acme.com" },
              { label: "Phone", key: "phone", placeholder: "+91 98765 43210" },
              { label: "Location", key: "location", placeholder: "Mumbai" },
            ].map(f => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs">{f.label}</Label>
                <Input placeholder={f.placeholder} value={(leadForm as any)[f.key]}
                  onChange={e => setLeadForm({ ...leadForm, [f.key]: e.target.value })} />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">Industry</Label>
              <Select value={leadForm.industry && !customIndustry ? leadForm.industry : (customIndustry ? "Others" : "none")} onValueChange={v => {
                if (v === "Others") { setLeadForm({ ...leadForm, industry: "" }); setCustomIndustry(" "); }
                else { setCustomIndustry(""); setLeadForm({ ...leadForm, industry: v === "none" ? "" : v }); }
              }}>
                <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Select —</SelectItem>
                  {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
              {customIndustry !== "" && (
                <Input placeholder="Type industry name…" value={customIndustry.trim()}
                  onChange={e => { setCustomIndustry(e.target.value); setLeadForm({ ...leadForm, industry: e.target.value }); }}
                  className="mt-1" />
              )}
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Add to List</Label>
              <Select value={leadForm.list_id || "none"} onValueChange={v => setLeadForm({ ...leadForm, list_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select list (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No list</SelectItem>
                  {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setLeadDialogOpen(false); setLeadForm(emptyLead()); setCustomIndustry(""); }}>Cancel</Button>
            <Button onClick={() => addLead.mutate()} disabled={addLead.isPending}>Add Lead</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Lead Dialog */}
      <Dialog open={!!editingLead} onOpenChange={(o) => { if (!o) { setEditingLead(null); setEditForm(emptyLead()); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Lead</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            {[
              { label: "Company Name", key: "company_name", placeholder: "Acme Corp" },
              { label: "Contact Name", key: "person_name", placeholder: "John Doe" },
              { label: "Email *", key: "email", placeholder: "john@acme.com" },
              { label: "Phone", key: "phone", placeholder: "+91 98765 43210" },
              { label: "Location", key: "location", placeholder: "Mumbai" },
            ].map(f => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs">{f.label}</Label>
                <Input placeholder={f.placeholder} value={(editForm as any)[f.key]}
                  onChange={e => setEditForm({ ...editForm, [f.key]: e.target.value })} />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">Industry</Label>
              <Select value={editForm.industry || "none"} onValueChange={v =>
                setEditForm({ ...editForm, industry: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Select —</SelectItem>
                  {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Contact List</Label>
              <Select value={editForm.list_id || "none"} onValueChange={v =>
                setEditForm({ ...editForm, list_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select list" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No list</SelectItem>
                  {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setEditingLead(null); setEditForm(emptyLead()); }}>Cancel</Button>
            <Button onClick={() => updateLead.mutate()} disabled={updateLead.isPending}>
              {updateLead.isPending ? "Saving…" : "Update Lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={csvDialogOpen} onOpenChange={(o) => { if (!o) { setCsvDialogOpen(false); resetCsvImport(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import CSV</DialogTitle>
            <div className="flex items-center gap-2 mt-3">
              {[1, 2, 3].map(s => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                    csvStep > s ? "bg-[#6366f1] border-[#6366f1] text-white"
                    : csvStep === s ? "border-[#6366f1] text-[#6366f1]"
                    : "border-[#e5e7eb] text-[#9ca3af]"
                  }`}>
                    {csvStep > s ? <Check className="h-3.5 w-3.5" /> : s}
                  </div>
                  <span className={`text-xs font-medium ${csvStep === s ? "text-[#6366f1]" : "text-[#9ca3af]"}`}>
                    {["List Name", "Map Columns", "Preview & Import"][s - 1]}
                  </span>
                  {s < 3 && <ChevronRight className="h-3.5 w-3.5 text-[#d1d5db]" />}
                </div>
              ))}
            </div>
          </DialogHeader>

          {csvStep === 1 && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Contact List Name *</Label>
                <div className="flex gap-2">
                  <Input placeholder="e.g. IT Companies Q3" value={csvListName}
                    onChange={e => { setCsvListName(e.target.value); setCsvListId(""); }} />
                  <span className="text-sm text-[#9ca3af] self-center">or</span>
                  <Select value={csvListId} onValueChange={v => { setCsvListId(v); setCsvListName(""); }}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="Existing list" /></SelectTrigger>
                    <SelectContent>
                      {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-[#9ca3af]">Type a new list name or select an existing one</p>
              </div>
              <div className="space-y-2">
                <Label>Upload CSV File *</Label>
                <div className="border-2 border-dashed border-[#e5e7eb] rounded-xl p-8 text-center hover:border-[#6366f1] transition-colors cursor-pointer"
                  onClick={() => fileRef.current?.click()}>
                  <Upload className="h-8 w-8 text-[#9ca3af] mx-auto mb-2" />
                  <div className="text-sm font-medium text-[#374151]">Click to upload CSV</div>
                  <div className="text-xs text-[#9ca3af] mt-1">First row should be column headers</div>
                  <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileUpload} />
                </div>
              </div>
              <div className="bg-[#f9fafb] rounded-lg p-3 text-xs text-[#6b7280]">
                <div className="font-medium mb-1">Expected columns (any order):</div>
                <div className="font-mono">company_name, person_name, email, phone, industry, location</div>
                <div className="mt-1">Only <strong>email</strong> is required. Others are optional.</div>
              </div>
            </div>
          )}

          {csvStep === 2 && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-[#6b7280]">Match your CSV columns to the correct fields. <strong>Email is required.</strong></p>
              <div className="space-y-3">
                {DB_FIELDS.map(field => (
                  <div key={field} className="flex items-center gap-3">
                    <div className="w-32 text-sm font-medium text-[#374151]">{DB_LABELS[field]}</div>
                    <ChevronRight className="h-4 w-4 text-[#9ca3af]" />
                    <Select value={csvMapping[field] ?? "skip"} onValueChange={v => {
                      const m = { ...csvMapping };
                      if (v === "skip") delete m[field]; else m[field] = v;
                      setCsvMapping(m);
                    }}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Skip this field" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skip">— Skip —</SelectItem>
                        {csvHeaders.map((h, i) => <SelectItem key={i} value={String(i)}>Col {i + 1}: {h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {!emailMapped && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  ⚠️ Please map the Email column — it's required to import leads.
                </div>
              )}
              <div className="text-xs text-[#9ca3af]">
                CSV has <strong>{csvRows.length}</strong> data rows and <strong>{csvHeaders.length}</strong> columns.
              </div>
            </div>
          )}

          {csvStep === 3 && (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[#6b7280]">Preview of first {Math.min(5, csvRows.length)} rows out of <strong>{csvRows.length}</strong> total.</p>
                <Badge variant="outline" className="text-[#6366f1] border-[#6366f1]">
                  {csvListName || lists.find(l => l.id === csvListId)?.name || "No list"}
                </Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#f9fafb]">
                      {DB_FIELDS.filter(f => csvMapping[f] !== undefined).map(f => (
                        <th key={f} className="px-3 py-2 text-left font-semibold text-[#9ca3af] uppercase tracking-wide border border-[#f3f4f6]">
                          {DB_LABELS[f].replace(" *", "")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-b border-[#f3f4f6] hover:bg-[#fafafa]">
                        {DB_FIELDS.filter(f => csvMapping[f] !== undefined).map(f => (
                          <td key={f} className="px-3 py-2 text-[#374151] border border-[#f3f4f6] max-w-[150px] truncate">
                            {row[Number(csvMapping[f])] || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg p-3 text-sm text-[#15803d]">
                ✅ Ready to import <strong>{csvRows.length}</strong> leads. Duplicate emails will be skipped automatically.
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between">
            <div>{csvStep > 1 && <Button variant="ghost" onClick={() => setCsvStep(s => s - 1)}>← Back</Button>}</div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setCsvDialogOpen(false); resetCsvImport(); }}>Cancel</Button>
              {csvStep === 1 && (
                <Button disabled={(!csvListName.trim() && !csvListId) || csvHeaders.length === 0} onClick={() => setCsvStep(2)}>Next →</Button>
              )}
              {csvStep === 2 && (
                <Button disabled={!emailMapped} onClick={() => setCsvStep(3)}>Preview →</Button>
              )}
              {csvStep === 3 && (
                <Button onClick={handleCsvImport} disabled={importing}>
                  {importing ? "Importing…" : `Import ${csvRows.length} Leads`}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
