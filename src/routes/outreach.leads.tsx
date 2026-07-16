import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { Plus, Upload, Trash2, ChevronRight, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  not_contacted: "bg-gray-100 text-gray-600",
  email_sent:    "bg-blue-100 text-blue-700",
  opened:        "bg-amber-100 text-amber-700",
  replied:       "bg-purple-100 text-purple-700",
  interested:    "bg-green-100 text-green-700",
  meeting_scheduled: "bg-teal-100 text-teal-700",
  client:        "bg-emerald-100 text-emerald-700",
  lost:          "bg-red-100 text-red-700",
};

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

// Parse CSV text into array of rows
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
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [leadForm, setLeadForm] = useState<LeadForm>(emptyLead());

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

  const { data: lists = [] } = useQuery({
    queryKey: ["contact_lists"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contact_lists").select("*, client_leads(count)").order("name");
      if (error) throw error;
      return (data ?? []) as (ContactList & { client_leads: { count: number }[] })[];
    },
  });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["client_leads", selectedList, search],
    queryFn: async () => {
      let q = supabase.from("client_leads").select("*").order("created_at", { ascending: false });
      if (selectedList !== "all") q = q.eq("list_id", selectedList);
      if (search) q = q.or(`company_name.ilike.%${search}%,person_name.ilike.%${search}%,email.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ClientLead[];
    },
  });

  const createList = useMutation({
    mutationFn: async (name: string) => {
      if (!name.trim()) throw new Error("List name required");
      const { data, error } = await supabase.from("contact_lists").insert({ name: name.trim() }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact_lists"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteList = useMutation({
    mutationFn: async (id: string) => {
      // Remove list_id from leads in this list first
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
      setLeadDialogOpen(false); setLeadForm(emptyLead());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead deleted");
      qc.invalidateQueries({ queryKey: ["client_leads"] });
      qc.invalidateQueries({ queryKey: ["contact_lists"] });
    },
  });

  // CSV Import handlers
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
      // Auto-map columns by name matching
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
    if (!emailColIdx && emailColIdx !== "0") {
      toast.error("Email column mapping is required"); return;
    }

    setImporting(true);
    try {
      // Create list if new
      let listId = csvListId;
      if (!listId && csvListName.trim()) {
        const newList = await createList.mutateAsync(csvListName.trim());
        listId = newList.id;
        setCsvListId(listId);
      }

      // Get existing emails to skip duplicates
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

      // Insert in batches of 100
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
      if (listId) setSelectedList(listId);

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
          <Button onClick={() => setLeadDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Lead
          </Button>
        </div>
      </div>

      {/* List tabs */}
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => setSelectedList("all")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${selectedList === "all" ? "bg-[#6366f1] text-white border-[#6366f1]" : "border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]"}`}>
          All leads <span className="ml-1 opacity-70">({leads.length})</span>
        </button>
        {lists.map(l => (
          <div key={l.id} className="relative group/list flex items-center gap-1">
            <button type="button" onClick={() => setSelectedList(l.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${selectedList === l.id ? "bg-[#6366f1] text-white border-[#6366f1]" : "border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]"}`}>
              {l.name} <span className="ml-1 opacity-70">({l.client_leads?.[0]?.count ?? 0})</span>
            </button>
            <button
              type="button"
              onClick={() => { if (confirm(`Delete list "${l.name}"? Leads will be kept but unassigned.`)) deleteList.mutate(l.id); }}
              className="opacity-0 group-hover/list:opacity-100 p-1 rounded hover:bg-red-50 text-[#9ca3af] hover:text-red-500 transition-all"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <Input placeholder="Search by company, name, email…" value={search}
        onChange={e => setSearch(e.target.value)} className="max-w-sm" />

      <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#f9fafb]">
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
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-[#9ca3af]">Loading…</TableCell></TableRow>
            ) : leads.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-[#9ca3af]">No leads found. Import a CSV or add manually.</TableCell></TableRow>
            ) : leads.map(l => (
              <TableRow key={l.id} className="group hover:bg-[#fafafa]">
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
                  <button type="button" onClick={() => deleteLead.mutate(l.id)}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-[#9ca3af] hover:text-red-500 transition-all">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* New List Dialog */}
      <Dialog open={listDialogOpen} onOpenChange={setListDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Contact List</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label>List Name</Label>
            <Input placeholder="e.g. IT Companies Mumbai" value={newListName} onChange={e => setNewListName(e.target.value)} />
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

      {/* Add Lead Dialog */}
      <Dialog open={leadDialogOpen} onOpenChange={(o) => { if (!o) { setLeadDialogOpen(false); setLeadForm(emptyLead()); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Lead</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
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
              <Select value={leadForm.industry || "none"} onValueChange={v => {
                if (v === "Others") { setLeadForm({ ...leadForm, industry: "" }); setCustomIndustry(""); }
                else setLeadForm({ ...leadForm, industry: v === "none" ? "" : v });
              }}>
                <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Select —</SelectItem>
                  {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
              {(leadForm.industry === "" && customIndustry !== undefined) && (
                <Input placeholder="Type industry name…" value={customIndustry}
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
            <Button variant="ghost" onClick={() => { setLeadDialogOpen(false); setLeadForm(emptyLead()); }}>Cancel</Button>
            <Button onClick={() => addLead.mutate()} disabled={addLead.isPending}>Add Lead</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={csvDialogOpen} onOpenChange={(o) => { if (!o) { setCsvDialogOpen(false); resetCsvImport(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import CSV</DialogTitle>
            {/* Step indicator */}
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

          {/* Step 1: List name + file upload */}
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

          {/* Step 2: Column mapping */}
          {csvStep === 2 && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-[#6b7280]">
                Match your CSV columns to the correct fields. <strong>Email is required.</strong>
              </p>
              <div className="space-y-3">
                {DB_FIELDS.map(field => (
                  <div key={field} className="flex items-center gap-3">
                    <div className="w-32 text-sm font-medium text-[#374151]">{DB_LABELS[field]}</div>
                    <ChevronRight className="h-4 w-4 text-[#9ca3af]" />
                    <Select
                      value={csvMapping[field] ?? "skip"}
                      onValueChange={v => {
                        const m = { ...csvMapping };
                        if (v === "skip") delete m[field];
                        else m[field] = v;
                        setCsvMapping(m);
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Skip this field" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skip">— Skip —</SelectItem>
                        {csvHeaders.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>
                            Col {i + 1}: {h}
                          </SelectItem>
                        ))}
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

          {/* Step 3: Preview */}
          {csvStep === 3 && (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[#6b7280]">
                  Preview of first {Math.min(5, csvRows.length)} rows out of <strong>{csvRows.length}</strong> total.
                </p>
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
            <div>
              {csvStep > 1 && (
                <Button variant="ghost" onClick={() => setCsvStep(s => s - 1)}>← Back</Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setCsvDialogOpen(false); resetCsvImport(); }}>Cancel</Button>
              {csvStep === 1 && (
                <Button disabled={!csvListName.trim() && !csvListId || csvHeaders.length === 0}
                  onClick={() => setCsvStep(2)}>
                  Next →
                </Button>
              )}
              {csvStep === 2 && (
                <Button disabled={!emailMapped} onClick={() => setCsvStep(3)}>
                  Preview →
                </Button>
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
