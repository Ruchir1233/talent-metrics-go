import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase, type EmailTemplate } from "@/lib/supabase";

export const Route = createFileRoute("/outreach/templates")({
  head: () => ({ meta: [{ title: "Templates — Kaapro Outreach" }] }),
  component: TemplatesPage,
});

const CATEGORIES = ["IT Companies", "Manufacturing", "Contract Staffing"] as const;
const TYPES = ["Introduction", "Follow-up", "Final"] as const;
const VARIABLES = ["{{first_name}}", "{{company}}", "{{industry}}", "{{location}}"];

type FormState = {
  name: string; category: string; type: string;
  subject: string; body_html: string;
};

const emptyForm = (): FormState => ({
  name: "", category: "IT Companies", type: "Introduction",
  subject: "", body_html: "",
});

const CATEGORY_COLORS: Record<string, string> = {
  "IT Companies": "bg-blue-50 text-blue-700 border-blue-200",
  "Manufacturing": "bg-orange-50 text-orange-700 border-orange-200",
  "Contract Staffing": "bg-purple-50 text-purple-700 border-purple-200",
};
const TYPE_COLORS: Record<string, string> = {
  "Introduction": "bg-green-50 text-green-700 border-green-200",
  "Follow-up": "bg-amber-50 text-amber-700 border-amber-200",
  "Final": "bg-red-50 text-red-700 border-red-200",
};

function TemplatesPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [activeTab, setActiveTab] = useState<string>("All");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["email_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_templates").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EmailTemplate[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name required");
      if (!form.subject.trim()) throw new Error("Subject required");
      if (!form.body_html.trim()) throw new Error("Body required");
      const payload = {
        name: form.name.trim(), category: form.category, type: form.type.toLowerCase(),
        subject: form.subject.trim(), body_html: form.body_html.trim(),
        updated_at: new Date().toISOString(),
      };
      if (editingId) {
        const { error } = await supabase.from("email_templates").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("email_templates").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Template updated" : "Template created");
      qc.invalidateQueries({ queryKey: ["email_templates"] });
      setDialogOpen(false); setEditingId(null); setForm(emptyForm());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["email_templates"] }); },
  });

  const openEdit = (t: EmailTemplate) => {
    setEditingId(t.id);
    setForm({ name: t.name, category: t.category ?? "IT Companies", type: t.type, subject: t.subject, body_html: t.body_html });
    setDialogOpen(true);
  };

  const insertVariable = (v: string) => {
    const ref = bodyRef.current; if (!ref) return;
    const s = ref.selectionStart ?? ref.value.length;
    const e = ref.selectionEnd ?? ref.value.length;
    const val = ref.value.slice(0, s) + v + ref.value.slice(e);
    setForm(f => ({ ...f, body_html: val }));
    setTimeout(() => { ref.focus(); ref.setSelectionRange(s + v.length, s + v.length); }, 0);
  };

  const filtered = activeTab === "All" ? templates : templates.filter(t => t.category === activeTab);
  const tabs = ["All", ...CATEGORIES];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Email Templates</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Reusable email templates for outreach sequences.</p>
        </div>
        <Button onClick={() => { setEditingId(null); setForm(emptyForm()); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> New Template
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-[#e5e7eb]">
        {tabs.map(tab => (
          <button key={tab} type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab ? "border-[#6366f1] text-[#6366f1]" : "border-transparent text-[#6b7280] hover:text-[#374151]"
            }`}
          >{tab}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[#9ca3af]">
          <div className="text-4xl mb-3">📝</div>
          <div className="font-medium text-[#374151]">No templates yet</div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(t => (
            <div key={t.id} className="bg-white border border-[#e5e7eb] rounded-xl p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <div className="font-semibold text-[#111827] text-sm">{t.name}</div>
                <div className="flex gap-1 shrink-0 ml-2">
                  <button type="button" onClick={() => openEdit(t)} className="p-1 rounded hover:bg-[#f3f4f6] text-[#9ca3af] hover:text-[#374151]">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => del.mutate(t.id)} className="p-1 rounded hover:bg-red-50 text-[#9ca3af] hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex gap-1.5 mb-3 flex-wrap">
                <Badge variant="outline" className={`text-[10px] ${CATEGORY_COLORS[t.category ?? ""] ?? ""}`}>{t.category}</Badge>
                <Badge variant="outline" className={`text-[10px] ${TYPE_COLORS[t.type] ?? ""}`}>{t.type}</Badge>
              </div>
              <div className="text-xs text-[#6b7280] truncate mb-3">{t.subject}</div>
              <div className="text-xs text-[#9ca3af] line-clamp-2">{t.body_html.replace(/\n/g, " ")}</div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setEditingId(null); setForm(emptyForm()); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Template" : "New Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input placeholder="e.g. IT Intro Email" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Subject *</Label>
              <Input placeholder="Subject line…" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Body *</Label>
              <Textarea ref={bodyRef} placeholder="Email body…" value={form.body_html}
                onChange={e => setForm({ ...form, body_html: e.target.value })}
                className="min-h-[200px] text-sm font-mono" />
              <div className="flex flex-wrap gap-1.5">
                {VARIABLES.map(v => (
                  <button key={v} type="button" onClick={() => insertVariable(v)}
                    className="text-[11px] px-2 py-0.5 bg-[#eef2ff] text-[#6366f1] rounded border border-[#c7d2fe] hover:bg-[#e0e7ff] font-mono transition-colors">
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDialogOpen(false); setEditingId(null); setForm(emptyForm()); }}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : editingId ? "Update" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
