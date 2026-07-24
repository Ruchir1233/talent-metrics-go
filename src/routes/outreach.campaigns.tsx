import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { Plus, Play, FileText, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase, type Campaign, type EmailAccount, type ContactList, type CampaignStep, type EmailTemplate } from "@/lib/supabase";

export const Route = createFileRoute("/outreach/campaigns")({
  head: () => ({ meta: [{ title: "Campaigns — Kaapro Outreach" }] }),
  component: CampaignsPage,
});

const VARIABLES = ["{{first_name}}", "{{company}}", "{{industry}}", "{{location}}"];

type StepForm = { delay_days: number; subject: string; body_html: string };

type WizardForm = {
  name: string;
  email_account_id: string;
  contact_list_id: string;
  start_date: string;
  daily_limit: number;
  steps: [StepForm, StepForm, StepForm];
};

const defaultSteps: [StepForm, StepForm, StepForm] = [
  { delay_days: 0, subject: "", body_html: "" },
  { delay_days: 3, subject: "", body_html: "" },
  { delay_days: 5, subject: "", body_html: "" },
];

const tomorrow9am = () => {
  const d = new Date(); d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString().slice(0, 16);
};

function CampaignsPage() {
  const qc = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [form, setForm] = useState<WizardForm>({
    name: "", email_account_id: "", contact_list_id: "",
    start_date: tomorrow9am(), daily_limit: 30,
    steps: structuredClone(defaultSteps),
  });
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templateForStep, setTemplateForStep] = useState<number | null>(null);
  const bodyRefs = [useRef<HTMLTextAreaElement>(null), useRef<HTMLTextAreaElement>(null), useRef<HTMLTextAreaElement>(null)];

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Campaign[];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["email_accounts", "active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_accounts").select("*").eq("is_active", true).order("display_name");
      if (error) throw error;
      return (data ?? []) as EmailAccount[];
    },
  });

  const { data: lists = [] } = useQuery({
    queryKey: ["contact_lists"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contact_lists").select("*, client_leads(count)").order("name");
      if (error) throw error;
      return (data ?? []) as (ContactList & { client_leads: { count: number }[] })[];
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["email_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_templates").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as EmailTemplate[];
    },
  });

  const saveCampaign = useMutation({
    mutationFn: async (status: "draft" | "active") => {
      if (!form.name.trim()) throw new Error("Campaign name required");
      if (!form.email_account_id) throw new Error("Select a mailbox");
      if (!form.contact_list_id) throw new Error("Select a contact list");
      for (const [i, s] of form.steps.entries()) {
        if (!s.subject.trim()) throw new Error(`Step ${i + 1} subject required`);
        if (!s.body_html.trim()) throw new Error(`Step ${i + 1} body required`);
      }
      const list = lists.find(l => l.id === form.contact_list_id);

      if (editingId) {
        // Update existing campaign
        const { error: cErr } = await supabase.from("campaigns").update({
          name: form.name.trim(),
          email_account_id: form.email_account_id,
          contact_list_id: form.contact_list_id,
          start_date: form.start_date || null,
          daily_limit: form.daily_limit,
        }).eq("id", editingId);
        if (cErr) throw cErr;

        // Update steps
        await supabase.from("campaign_steps").delete().eq("campaign_id", editingId);
        const { error: sErr } = await supabase.from("campaign_steps").insert(
          form.steps.map((s, i) => ({
            campaign_id: editingId,
            step_number: i + 1,
            delay_days: s.delay_days,
            subject: s.subject.trim(),
            body_html: s.body_html.trim(),
          }))
        );
        if (sErr) throw sErr;
      } else {
        const { data: campaign, error: cErr } = await supabase.from("campaigns").insert({
          name: form.name.trim(),
          email_account_id: form.email_account_id,
          contact_list_id: form.contact_list_id,
          status,
          start_date: form.start_date || null,
          daily_limit: form.daily_limit,
          total_contacts: list?.client_leads?.[0]?.count ?? 0,
        }).select().single();
        if (cErr) throw cErr;

        const { error: sErr } = await supabase.from("campaign_steps").insert(
          form.steps.map((s, i) => ({
            campaign_id: campaign.id,
            step_number: i + 1,
            delay_days: s.delay_days,
            subject: s.subject.trim(),
            body_html: s.body_html.trim(),
          }))
        );
        if (sErr) throw sErr;

        if (status === "active") {
          await supabase.functions.invoke("launch-campaign", { body: { campaignId: campaign.id } });
        }
      }
    },
    onSuccess: (_, status) => {
      toast.success(editingId ? "Campaign updated!" : status === "draft" ? "Saved as draft" : "Campaign launched!");
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setWizardOpen(false);
      setWizardStep(1);
      setEditingId(null);
      setForm({ name: "", email_account_id: "", contact_list_id: "", start_date: tomorrow9am(), daily_limit: 30, steps: structuredClone(defaultSteps) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      // Delete related records first
      await supabase.from("email_sends").delete().eq("campaign_id", id);
      await supabase.from("campaign_steps").delete().eq("campaign_id", id);
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Campaign deleted"); qc.invalidateQueries({ queryKey: ["campaigns"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("campaigns").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success(status === "paused" ? "Campaign paused" : "Campaign resumed");
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const insertVariable = (stepIdx: number, variable: string) => {
    const ref = bodyRefs[stepIdx].current;
    if (!ref) return;
    const start = ref.selectionStart ?? ref.value.length;
    const end = ref.selectionEnd ?? ref.value.length;
    const newVal = ref.value.slice(0, start) + variable + ref.value.slice(end);
    updateStep(stepIdx, "body_html", newVal);
    setTimeout(() => { ref.focus(); ref.setSelectionRange(start + variable.length, start + variable.length); }, 0);
  };

  const updateStep = (i: number, field: keyof StepForm, value: string | number) => {
    const steps = [...form.steps] as typeof form.steps;
    (steps[i] as any)[field] = value;
    setForm({ ...form, steps });
  };

  const applyTemplate = (t: EmailTemplate) => {
    if (templateForStep === null) return;
    updateStep(templateForStep, "subject", t.subject);
    updateStep(templateForStep, "body_html", t.body_html);
    setTemplatePickerOpen(false);
    setTemplateForStep(null);
  };

  const openEdit = async (campaign: Campaign) => {
    setEditingId(campaign.id);
    // Load existing steps
    const { data: steps } = await supabase
      .from("campaign_steps").select("*")
      .eq("campaign_id", campaign.id).order("step_number");

    const loadedSteps: [StepForm, StepForm, StepForm] = structuredClone(defaultSteps);
    if (steps) {
      steps.forEach((s, i) => {
        if (i < 3) loadedSteps[i] = { delay_days: s.delay_days, subject: s.subject, body_html: s.body_html };
      });
    }
    setForm({
      name: campaign.name,
      email_account_id: campaign.email_account_id ?? "",
      contact_list_id: campaign.contact_list_id ?? "",
      start_date: campaign.start_date ? campaign.start_date.slice(0, 16) : tomorrow9am(),
      daily_limit: campaign.daily_limit,
      steps: loadedSteps,
    });
    setWizardStep(1);
    setWizardOpen(true);
  };

  const STATUS_COLORS: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    active: "bg-green-100 text-green-700",
    paused: "bg-amber-100 text-amber-700",
    completed: "bg-blue-100 text-blue-700",
  };

  const selectedList = lists.find(l => l.id === form.contact_list_id);
  const contactCount = selectedList?.client_leads?.[0]?.count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Campaigns</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Cold email sequences for client outreach.</p>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Campaign
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">Loading…</div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-20 text-[#9ca3af]">
          <div className="text-5xl mb-3">📧</div>
          <div className="font-medium text-[#374151]">No campaigns yet</div>
          <div className="text-sm mt-1">Create your first cold email campaign</div>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((c) => {

            return (
              <div key={c.id} className="bg-white border border-[#e5e7eb] rounded-xl p-5 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* Name + status */}
                    <div className="flex items-center gap-2 mb-4">
                      <span className="font-semibold text-[#111827] text-[15px]">{c.name}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {c.status}
                      </span>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      <div className="bg-[#f9fafb] rounded-lg p-3 text-center">
                        <div className="text-[22px] font-bold text-[#111827]">{c.total_contacts}</div>
                        <div className="text-[11px] text-[#9ca3af] mt-0.5">Contacts</div>
                      </div>
                      <div className="bg-[#eff6ff] rounded-lg p-3 text-center">
                        <div className="text-[22px] font-bold text-[#2563eb]">{c.total_sent}</div>
                        <div className="text-[11px] text-[#9ca3af] mt-0.5">Emails Sent</div>
                      </div>
                      <div className="bg-[#f0fdf4] rounded-lg p-3 text-center">
                        <div className="text-[22px] font-bold text-[#16a34a]">{c.total_replied}</div>
                        <div className="text-[11px] text-[#9ca3af] mt-0.5">Replies</div>
                      </div>
                      <div className="bg-[#fefce8] rounded-lg p-3 text-center">
                        <div className="text-[22px] font-bold text-[#ca8a04]">
                          {c.total_contacts > 0 ? Math.round((c.total_replied / c.total_contacts) * 100) : 0}%
                        </div>
                        <div className="text-[11px] text-[#9ca3af] mt-0.5">Reply Rate</div>
                      </div>
                    </div>

                    {/* Step-by-step progress */}
                    <div className="space-y-2">
                      <div className="text-[12px] text-[#6b7280] font-medium">Sequence Progress</div>
                      <div className="flex gap-2">
                        {[1, 2, 3].map(step => {
                          const stepSent = Math.max(0, Math.min(c.total_sent - (step - 1) * c.total_contacts, c.total_contacts));
                          const pct = c.total_contacts > 0 ? (stepSent / c.total_contacts) * 100 : 0;
                          const isDone = pct >= 100;
                          const inProgress = pct > 0 && pct < 100;
                          return (
                            <div key={step} className="flex-1">
                              <div className="flex justify-between text-[10px] text-[#9ca3af] mb-1">
                                <span>Step {step}</span>
                                <span>{isDone ? "✅ Done" : inProgress ? `${stepSent}/${c.total_contacts}` : "Pending"}</span>
                              </div>
                              <div className="w-full bg-[#f3f4f6] rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full transition-all ${isDone ? "bg-[#16a34a]" : inProgress ? "bg-[#6366f1]" : "bg-[#e5e7eb]"}`}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0 ml-4 items-center">
                    {c.status === "active" && (
                      <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: c.id, status: "paused" })}>
                        ⏸ Pause
                      </Button>
                    )}
                    {c.status === "paused" && (
                      <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: c.id, status: "active" })}>
                        ▶ Resume
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteCampaign.mutate(c.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Campaign Wizard */}
      <Dialog open={wizardOpen} onOpenChange={(o) => { if (!o) { setWizardOpen(false); setWizardStep(1); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Campaign" : "New Campaign"}</DialogTitle>
            <div className="flex gap-1 mt-2">
              {[1, 2, 3, 4].map(s => (
                <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= wizardStep ? "bg-[#6366f1]" : "bg-[#e5e7eb]"}`} />
              ))}
            </div>
            <div className="text-xs text-[#9ca3af] mt-1">
              Step {wizardStep} of 4 — {["Setup", "Audience", "Sequence", "Review"][wizardStep - 1]}
            </div>
          </DialogHeader>

          {/* Step 1: Setup */}
          {wizardStep === 1 && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Campaign Name *</Label>
                <Input placeholder="e.g. IT Companies Q3 Outreach" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Select Mailbox *</Label>
                <Select value={form.email_account_id} onValueChange={v => setForm({ ...form, email_account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select email account…" /></SelectTrigger>
                  <SelectContent>
                    {accounts.length === 0 ? (
                      <div className="px-2 py-2 text-sm text-muted-foreground">No active email accounts. Add one in Settings.</div>
                    ) : accounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.display_name} — {a.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 2: Audience */}
          {wizardStep === 2 && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Contact List *</Label>
                <Select value={form.contact_list_id} onValueChange={v => setForm({ ...form, contact_list_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select contact list…" /></SelectTrigger>
                  <SelectContent>
                    {lists.map(l => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} — {l.client_leads?.[0]?.count ?? 0} contacts
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Start Date & Time</Label>
                <Input type="datetime-local" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Daily Limit</Label>
                <Input type="number" min={1} max={200} value={form.daily_limit} onChange={e => setForm({ ...form, daily_limit: Number(e.target.value) })} />
              </div>
            </div>
          )}

          {/* Step 3: Sequence */}
          {wizardStep === 3 && (
            <div className="space-y-5 py-2">
              {form.steps.map((step, i) => (
                <div key={i} className="border border-[#e5e7eb] rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-[#111827]">Step {i + 1}</span>
                    {i > 0 && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-[#6b7280]">Delay (days)</Label>
                        <Input type="number" min={1} className="w-16 h-7 text-sm" value={step.delay_days}
                          onChange={e => updateStep(i, "delay_days", Number(e.target.value))} />
                      </div>
                    )}
                    {i === 0 && <span className="text-xs text-[#9ca3af]">Sends on start date</span>}
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Subject *</Label>
                      <Input placeholder="Subject line…" value={step.subject}
                        onChange={e => updateStep(i, "subject", e.target.value)} />
                    </div>
                    <div className="flex items-end">
                      <Button variant="outline" size="sm" className="text-xs whitespace-nowrap"
                        onClick={() => { setTemplateForStep(i); setTemplatePickerOpen(true); }}>
                        <FileText className="h-3.5 w-3.5 mr-1" /> Use Template
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Body *</Label>
                    <Textarea ref={bodyRefs[i]} placeholder="Email body…" value={step.body_html}
                      onChange={e => updateStep(i, "body_html", e.target.value)}
                      className="min-h-[120px] text-sm font-mono" />
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {VARIABLES.map(v => (
                        <button key={v} type="button" onClick={() => insertVariable(i, v)}
                          className="text-[11px] px-2 py-0.5 bg-[#eef2ff] text-[#6366f1] rounded border border-[#c7d2fe] hover:bg-[#e0e7ff] font-mono transition-colors">
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Step 4: Review */}
          {wizardStep === 4 && (
            <div className="space-y-4 py-2">
              <div className="bg-[#f9fafb] rounded-lg border border-[#e5e7eb] p-4 space-y-3">
                <h3 className="font-semibold text-[#111827]">Campaign Summary</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-[#9ca3af]">Name</span><div className="font-medium mt-0.5">{form.name}</div></div>
                  <div><span className="text-[#9ca3af]">Mailbox</span><div className="font-medium mt-0.5">{accounts.find(a => a.id === form.email_account_id)?.email ?? "—"}</div></div>
                  <div><span className="text-[#9ca3af]">List</span><div className="font-medium mt-0.5">{selectedList?.name ?? "—"}</div></div>
                  <div><span className="text-[#9ca3af]">Contacts</span><div className="font-medium mt-0.5">{contactCount}</div></div>
                  <div><span className="text-[#9ca3af]">Start Date</span><div className="font-medium mt-0.5">{form.start_date ? new Date(form.start_date).toLocaleString("en-IN") : "—"}</div></div>
                  <div><span className="text-[#9ca3af]">Daily Limit</span><div className="font-medium mt-0.5">{form.daily_limit}/day</div></div>
                </div>
                <div className="border-t border-[#e5e7eb] pt-3 mt-2">
                  <div className="text-[#9ca3af] text-xs font-semibold uppercase tracking-wide mb-2">Sequence</div>
                  {form.steps.map((s, i) => (
                    <div key={i} className="flex gap-2 text-sm py-1">
                      <span className="text-[#6366f1] font-semibold w-16">Step {i + 1}</span>
                      <span className="text-[#6b7280] w-20">{i === 0 ? "Day 0" : `+${s.delay_days}d`}</span>
                      <span className="text-[#374151] truncate">{s.subject || "(no subject)"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between">
            <div>
              {wizardStep > 1 && (
                <Button variant="ghost" onClick={() => setWizardStep(w => w - 1)}>← Back</Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => { setWizardOpen(false); setWizardStep(1); }}>Cancel</Button>
              {wizardStep < 4 ? (
                <Button onClick={() => setWizardStep(w => w + 1)}>Continue →</Button>
              ) : (
                <>
                  {editingId ? (
                    <Button onClick={() => saveCampaign.mutate("draft")} disabled={saveCampaign.isPending}>
                      <Pencil className="h-4 w-4 mr-1" /> {saveCampaign.isPending ? "Saving…" : "Update Campaign"}
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" onClick={() => saveCampaign.mutate("draft")} disabled={saveCampaign.isPending}>
                        <FileText className="h-4 w-4 mr-1" /> Save as Draft
                      </Button>
                      <Button onClick={() => saveCampaign.mutate("active")} disabled={saveCampaign.isPending}>
                        <Play className="h-4 w-4 mr-1" /> Launch Now
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Picker */}
      <Dialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Choose a Template</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto py-2">
            {templates.length === 0 ? (
              <div className="text-center text-[#9ca3af] py-8">No templates yet. Create some in Templates page.</div>
            ) : templates.map(t => (
              <div key={t.id} className="border border-[#e5e7eb] rounded-lg p-3 hover:bg-[#f9fafb] cursor-pointer"
                onClick={() => applyTemplate(t)}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{t.name}</span>
                  <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                  <Badge variant="outline" className="text-[10px]">{t.type}</Badge>
                </div>
                <div className="text-xs text-[#6b7280] truncate">{t.subject}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
