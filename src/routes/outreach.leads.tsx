import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Upload, Trash2 } from "lucide-react";
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
  contacted: "bg-blue-100 text-blue-700",
  replied: "bg-green-100 text-green-700",
  bounced: "bg-red-100 text-red-700",
  unsubscribed: "bg-orange-100 text-orange-700",
};

type LeadForm = {
  list_id: string; company_name: string; person_name: string;
  email: string; phone: string; industry: string; location: string;
};

const emptyLead = (): LeadForm => ({
  list_id: "", company_name: "", person_name: "",
  email: "", phone: "", industry: "", location: "",
});

function LeadsPage() {
  const qc = useQueryClient();
  const [selectedList, setSelectedList] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [leadForm, setLeadForm] = useState<LeadForm>(emptyLead());

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
    mutationFn: async () => {
      if (!newListName.trim()) throw new Error("List name required");
      const { error } = await supabase.from("contact_lists").insert({ name: newListName.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("List created"); qc.invalidateQueries({ queryKey: ["contact_lists"] });
      setListDialogOpen(false); setNewListName("");
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
      toast.success("Lead added"); qc.invalidateQueries({ queryKey: ["client_leads"] });
      setLeadDialogOpen(false); setLeadForm(emptyLead());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lead deleted"); qc.invalidateQueries({ queryKey: ["client_leads"] }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Contact Lists</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Manage leads and contact lists for campaigns.</p>
        </div>
        <div className="flex gap-2">
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
          All leads
        </button>
        {lists.map(l => (
          <button key={l.id} type="button" onClick={() => setSelectedList(l.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${selectedList === l.id ? "bg-[#6366f1] text-white border-[#6366f1]" : "border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]"}`}>
            {l.name} <span className="ml-1 opacity-70">({l.client_leads?.[0]?.count ?? 0})</span>
          </button>
        ))}
      </div>

      <Input placeholder="Search by company, name, email…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />

      <div className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#f9fafb]">
              <TableHead className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Company</TableHead>
              <TableHead className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Contact</TableHead>
              <TableHead className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Email</TableHead>
              <TableHead className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Industry</TableHead>
              <TableHead className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider">Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-[#9ca3af]">Loading…</TableCell></TableRow>
            ) : leads.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-[#9ca3af]">No leads found.</TableCell></TableRow>
            ) : leads.map(l => (
              <TableRow key={l.id} className="group hover:bg-[#fafafa]">
                <TableCell className="font-medium text-[#111827]">{l.company_name ?? "—"}</TableCell>
                <TableCell className="text-[#374151]">{l.person_name ?? "—"}</TableCell>
                <TableCell className="text-[#6b7280] text-sm">{l.email}</TableCell>
                <TableCell className="text-[#6b7280] text-sm">{l.industry ?? "—"}</TableCell>
                <TableCell>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STAGE_COLORS[l.pipeline_stage] ?? "bg-gray-100 text-gray-600"}`}>
                    {l.pipeline_stage.replace("_", " ")}
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
            <Button onClick={() => createList.mutate()} disabled={createList.isPending}>Create</Button>
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
              { label: "Industry", key: "industry", placeholder: "IT / Manufacturing" },
              { label: "Location", key: "location", placeholder: "Mumbai" },
            ].map(f => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs">{f.label}</Label>
                <Input placeholder={f.placeholder} value={(leadForm as any)[f.key]}
                  onChange={e => setLeadForm({ ...leadForm, [f.key]: e.target.value })} />
              </div>
            ))}
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Add to List</Label>
              <Select value={leadForm.list_id} onValueChange={v => setLeadForm({ ...leadForm, list_id: v })}>
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
    </div>
  );
}
