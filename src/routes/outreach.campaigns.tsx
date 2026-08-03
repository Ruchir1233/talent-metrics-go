import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { Plus, Play, FileText, Trash2, Pencil, Mail, Users, TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase, type Campaign, type EmailAccount, type ContactList, type EmailTemplate, type CampaignMailbox } from "@/lib/supabase";

export const Route = createFileRoute("/outreach/campaigns")({
  head: () => ({ meta: [{ title: "Campaigns — Kaapro Outreach" }] }),
  component: CampaignsPage,
});

const VARIABLES = ["{{first_name}}", "{{company}}", "{{industry}}", "{{location}}"];

type StepForm = { delay_days: number; subject: string; body_html: string };
type WizardForm = {
  name: string;
  email_account_ids: string[];
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
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
  return d.toISOString().slice(0, 16);
};

const emptyForm = (): WizardForm => ({
  name: "", email_account_ids: [], contact_list_id: "",
  start_date: tomorrow9am(), daily_limit: 20,
  steps: structuredClone(defaultSteps),
});

function CampaignsPage() {
  const qc = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [form, setForm] = useState<WizardForm>(emptyForm());
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

  const { data: campaignMailboxes = [] } = useQuery({
    queryKey: ["campaign_mailboxes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_mailboxes")
        .select("*, email_accounts!email_account_id(display_name, email)");
      if (error) return [];
      return (data ?? []) as (CampaignMailbox & { email_accounts: { display_name: string; email: string } })[];
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
      if (form.email_account_ids.length === 0) throw new Error("Select at least one mailbox");
      if (!form.contact_list_id) throw new Error("Select a contact list");
      for (const [i, s] of form.steps.entries()) {
        if (!s.subject.trim()) throw new Error(`Step ${i + 1} subject required`);
        if (!s.body_html.trim()) throw new Error(`Step ${i + 1} body required`);
      }

      const list = lists.find(l => l.id === form.contact_list_id);
      const totalContacts = list?.client_leads?.[0]?.count ?? 0;
      const perMailbox = Math.ceil(totalContacts / form.email_account_ids.length);

      // Use first mailbox as primary for backward compatibility
      const primaryAccountId = form.email_account_ids[0];

      if (editingId) {
        const { error } = await supabase.from("campaigns").update({
          name: form.name.trim(),
          email_account_id: primaryAccountId,
          contact_list_id: form.contact_list_id,
          start_date: form.start_date || null,
          daily_limit: form.daily_limit,
        }).eq("id", editingId);
        if (error) throw error;

        await supabase.from("campaign_steps").delete().eq("campaign_id", editingId);
        await supabase.from("campaign_mailboxes").delete().eq("campaign_id", editingId);

        await supabase.from("campaign_steps").insert(
          form.steps.map((s, i) => ({
            campaign_id: editingId, step_number: i + 1,
            delay_days: s.delay_days, subject: s.subject.trim(), body_html: s.body_html.trim(),
          }))
        );
        await supabase.from("campaign_mailboxes").insert(
          form.email_account_ids.map(aid => ({
            campaign_id: editingId, email_account_id: aid,
            assigned_contacts: perMailbox,
          }))
        );
      } else {
        const { data: campaign, error: cErr } = await supabase.from("campaigns").insert({
          name: form.name.trim(),
          email_account_id: primaryAccountId,
          contact_list_id: form.contact_list_id,
          status,
          start_date: form.start_date || null,
          daily_limit: form.daily_limit,
          total_contacts: totalContacts,
        }).select().single();
        if (cErr) throw cErr;

        await supabase.from("campaign_steps").insert(
          form.steps.map((s, i) => ({
            campaign_id: campaign.id, step_number: i + 1,
            delay_days: s.delay_days, subject: s.subject.trim(), body_html: s.body_html.trim(),
          }))
        );
        await supabase.from("campaign_mailboxes").insert(
          form.email_account_ids.map(aid => ({
            campaign_id: campaign.id, email_account_id: aid,
            assigned_contacts: perMailbox,
          }))
        );

        if (status === "active") {
          await supabase.functions.invoke("launch-campaign", { body: { campaignId: campaign.id } });
        }
      }
    },
    onSuccess: (_, status) => {
      toast.success(editingId ? "Campaign updated!" : status === "draft" ? "Saved as draft" : "Campaign launched! 🚀");
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign_mailboxes"] });
      closeWizard();
    },
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
  });

  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("email_sends").delete().eq("campaign_id", id);
      await supabase.from("campaign_steps").delete().eq("campaign_id", id);
      await supabase.from("campaign_mailboxes").delete().eq("campaign_id", id);
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Campaign deleted"); qc.invalidateQueries({ queryKey: ["campaigns"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = async (campaign: Campaign) => {
    setEditingId(campaign.id);
    const { data: steps } = await supabase.from("campaign_steps").select("*").eq("campaign_id", campaign.id).order("step_number");
    const { data: mailboxes } = await supabase.from("campaign_mailboxes").select("email_account_id").eq("campaign_id", campaign.id);

    const loadedSteps: [StepForm, StepForm, StepForm] = structuredClone(defaultSteps);
    steps?.forEach((s, i) => { if (i < 3) loadedSteps[i] = { delay_days: s.delay_days, subject: s.subject, body_html: s.body_html }; });

    setForm({
      name: campaign.name,
      email_account_ids: mailboxes?.map(m => m.email_account_id) ?? [campaign.email_account_id ?? ""],
      contact_list_id: campaign.contact_list_id ?? "",
      start_date: campaign.start_date ? campaign.start_date.slice(0, 16) : tomorrow9am(),
      daily_limit: campaign.daily_limit,
      steps: loadedSteps,
    });
    setWizardStep(1);
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false); setWizardStep(1); setEditingId(null); setForm(emptyForm());
  };

  const toggleMailbox = (id: string) => {
    setForm(f => ({
      ...f,
      email_account_ids: f.email_account_ids.includes(id)
        ? f.email_account_ids.filter(x => x !== id)
        : [...f.email_account_ids, id],
    }));
  };

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
    setTemplatePickerOpen(false); setTemplateForStep(null);
  };

  const selectedList = lists.find(l => l.id === form.contact_list_id);
  const totalContacts = selectedList?.client_leads?.[0]?.count ?? 0;
  const mailboxCount = form.email_account_ids.length;
  const perMailbox = mailboxCount > 0 ? Math.floor(totalContacts / mailboxCount) : 0;
  const extraContacts = mailboxCount > 0 ? totalContacts % mailboxCount : 0;

  const STATUS_COLORS: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    active: "bg-green-100 text-green-700",
    paused: "bg-amber-100 text-amber-700",
    completed: "bg-blue-100 text-blue-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Campaigns</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Cold email sequences for client outreach.</p>
        </div>
        <Button onClick={() => { setEditingId(null); setForm(emptyForm()); setWizardStep(1); setWizardOpen(true); }}>
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
        <div className="grid gap-5">
          {campaigns.map((c) => {
            const mailboxes = campaignMailboxes.filter(m => m.campaign_id === c.id);
            const bounced = c.total_bounced || 0;
            const activeContacts = Math.max(1, c.total_contacts - bounced);

            return (
              <div key={c.id} className="bg-white border border-[#e5e7eb] rounded-xl overflow-hidden shadow-sm">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#f3f4f6]">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-[#111827] text-[16px]">{c.name}</span>
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {c.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
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
                    <Button variant="ghost" size="sm" onClick={() => { setConfirmDeleteId(c.id); setConfirmDeleteName(c.name); }} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="p-5 space-y-5">
                  {/* Overall stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {[
                      { label: "Total Contacts", value: c.total_contacts, icon: <Users className="h-4 w-4" />, color: "text-[#111827]", bg: "bg-[#f9fafb]" },
                      { label: "Emails Sent", value: c.total_sent, icon: <Mail className="h-4 w-4" />, color: "text-[#2563eb]", bg: "bg-[#eff6ff]" },
                      { label: "Replies", value: c.total_replied, icon: <CheckCircle2 className="h-4 w-4" />, color: "text-[#16a34a]", bg: "bg-[#f0fdf4]" },
                      { label: "Bounced", value: bounced, icon: <AlertCircle className="h-4 w-4" />, color: "text-[#dc2626]", bg: "bg-[#fef2f2]" },
                      { label: "Reply Rate", value: `${c.total_contacts > 0 ? Math.round((c.total_replied / activeContacts) * 100) : 0}%`, icon: <TrendingUp className="h-4 w-4" />, color: "text-[#ca8a04]", bg: "bg-[#fefce8]" },
                    ].map((s) => (
                      <div key={s.label} className={`${s.bg} rounded-xl p-3.5`}>
                        <div className={`${s.color} mb-1 opacity-60`}>{s.icon}</div>
                        <div className={`text-[22px] font-bold ${s.color}`}>{s.value}</div>
                        <div className="text-[11px] text-[#9ca3af] mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Per mailbox breakdown */}
                  {mailboxes.length > 0 && (
                    <div>
                      <div className="text-[12px] font-semibold text-[#6b7280] uppercase tracking-wide mb-2">Per Mailbox</div>
                      <div className="grid gap-2">
                        {mailboxes.map(m => {
                          const sentPct = m.assigned_contacts > 0 ? Math.round((m.sent_count / m.assigned_contacts) * 100) : 0;
                          return (
                            <div key={m.id} className="flex items-center gap-4 bg-[#f9fafb] rounded-lg px-4 py-3">
                              <div className="w-7 h-7 rounded-full bg-[#6366f1] flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                                {m.email_accounts.display_name[0].toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[13px] font-semibold text-[#111827]">{m.email_accounts.display_name}</span>
                                  <span className="text-[11px] text-[#9ca3af]">{m.email_accounts.email}</span>
                                </div>
                                <div className="w-full bg-[#e5e7eb] rounded-full h-1.5">
                                  <div className="bg-[#6366f1] h-1.5 rounded-full transition-all" style={{ width: `${Math.min(sentPct, 100)}%` }} />
                                </div>
                              </div>
                              <div className="flex gap-4 shrink-0 text-center">
                                <div>
                                  <div className="text-[14px] font-bold text-[#2563eb]">{m.sent_count}</div>
                                  <div className="text-[10px] text-[#9ca3af]">Sent</div>
                                </div>
                                <div>
                                  <div className="text-[14px] font-bold text-[#16a34a]">{m.replied_count}</div>
                                  <div className="text-[10px] text-[#9ca3af]">Replies</div>
                                </div>
                                <div>
                                  <div className="text-[14px] font-bold text-[#dc2626]">{m.bounced_count}</div>
                                  <div className="text-[10px] text-[#9ca3af]">Bounced</div>
                                </div>
                                <div>
                                  <div className="text-[14px] font-bold text-[#9ca3af]">{m.assigned_contacts}</div>
                                  <div className="text-[10px] text-[#9ca3af]">Assigned</div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Step progress */}
                  <div>
                    <div className="text-[12px] font-semibold text-[#6b7280] uppercase tracking-wide mb-2">Sequence Progress</div>
                    <div className="flex gap-3">
                      {[1, 2, 3].map(step => {
                        const stepSent = Math.max(0, Math.min(c.total_sent - (step - 1) * c.total_contacts, activeContacts));
                        const pct = (stepSent / activeContacts) * 100;
                        const isDone = pct >= 100;
                        const inProgress = pct > 0 && !isDone;
                        return (
                          <div key={step} className="flex-1">
                            <div className="flex justify-between text-[11px] mb-1.5">
                              <span className="font-medium text-[#374151]">Step {step}</span>
                              <span className={isDone ? "text-[#16a34a] font-semibold" : "text-[#9ca3af]"}>
                                {isDone ? "✅ Done" : inProgress ? `${stepSent}/${activeContacts}` : "Pending"}
                              </span>
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
                    {bounced > 0 && (
                      <div className="mt-2 text-[11px] text-[#dc2626] flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {bounced} contact{bounced > 1 ? "s" : ""} bounced — excluded from progress
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Campaign Wizard */}
      <Dialog open={wizardOpen} onOpenChange={(o) => { if (!o) closeWizard(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Campaign" : "New Campaign"}</DialogTitle>
            <div className="flex gap-1 mt-2">
              {["Setup", "Audience", "Sequence", "Review"].map((label, i) => (
                <div key={i} className="flex-1">
                  <div className={`h-1.5 rounded-full mb-1 ${i + 1 <= wizardStep ? "bg-[#6366f1]" : "bg-[#e5e7eb]"}`} />
                  <div className={`text-[10px] text-center ${i + 1 === wizardStep ? "text-[#6366f1] font-semibold" : "text-[#9ca3af]"}`}>{label}</div>
                </div>
              ))}
            </div>
          </DialogHeader>

          {/* Step 1: Setup */}
          {wizardStep === 1 && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Campaign Name *</Label>
                <Input placeholder="e.g. IT Companies Hyderabad Q3" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Select Mailboxes * <span className="text-[#9ca3af] text-xs">(select one or more)</span></Label>
                {accounts.length === 0 ? (
                  <div className="text-sm text-[#9ca3af] border border-dashed rounded-lg p-4 text-center">
                    No active email accounts. Add one in Email Accounts settings.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {accounts.map(a => (
                      <div key={a.id}
                        onClick={() => toggleMailbox(a.id)}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          form.email_account_ids.includes(a.id)
                            ? "border-[#6366f1] bg-[#eef2ff]"
                            : "border-[#e5e7eb] hover:bg-[#f9fafb]"
                        }`}
                      >
                        <Checkbox checked={form.email_account_ids.includes(a.id)} onCheckedChange={() => toggleMailbox(a.id)} />
                        <div className="w-8 h-8 rounded-full bg-[#6366f1] flex items-center justify-center text-white text-[12px] font-bold">
                          {a.display_name[0].toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-sm text-[#111827]">{a.display_name}</div>
                          <div className="text-xs text-[#9ca3af]">{a.email} · {a.daily_limit}/day limit</div>
                        </div>
                        {form.email_account_ids.includes(a.id) && (
                          <Badge className="bg-[#6366f1] text-white text-[10px]">Selected</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {form.email_account_ids.length > 1 && (
                  <div className="text-xs text-[#6366f1] bg-[#eef2ff] rounded-lg p-2.5">
                    ✉️ {form.email_account_ids.length} mailboxes selected — leads will be split equally between them
                  </div>
                )}
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

              {form.contact_list_id && mailboxCount > 0 && (
                <div className="bg-[#f0f9ff] border border-[#bae6fd] rounded-lg p-3 text-sm space-y-1">
                  <div className="font-semibold text-[#0369a1]">Lead Distribution</div>
                  <div className="text-[#0c4a6e] text-xs space-y-0.5">
                    <div>📊 Total contacts: <strong>{totalContacts}</strong></div>
                    <div>📬 Mailboxes: <strong>{mailboxCount}</strong></div>
                    <div>👤 Per mailbox: <strong>{perMailbox}{extraContacts > 0 ? `–${perMailbox + 1}` : ""}</strong> contacts</div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Start Date & Time</Label>
                <Input type="datetime-local" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Daily Limit <span className="text-[#9ca3af] text-xs">(per mailbox)</span></Label>
                <Input type="number" min={1} max={200} value={form.daily_limit} onChange={e => setForm({ ...form, daily_limit: Number(e.target.value) })} />
                {mailboxCount > 1 && (
                  <div className="text-xs text-[#6b7280]">
                    Total daily: ~{form.daily_limit * mailboxCount} emails/day ({form.daily_limit} × {mailboxCount} mailboxes)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Sequence */}
          {wizardStep === 3 && (
            <div className="space-y-5 py-2">
              {form.steps.map((step, i) => (
                <div key={i} className="border border-[#e5e7eb] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#6366f1] text-white flex items-center justify-center text-xs font-bold">{i + 1}</div>
                      <span className="font-semibold text-sm text-[#111827]">Step {i + 1}</span>
                      {i === 0 && <span className="text-xs text-[#9ca3af]">· Sends on start date</span>}
                    </div>
                    {i > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#9ca3af]">Wait</span>
                        <Input type="number" min={1} className="w-16 h-7 text-sm" value={step.delay_days}
                          onChange={e => updateStep(i, "delay_days", Number(e.target.value))} />
                        <span className="text-xs text-[#9ca3af]">days</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder="Subject line…" value={step.subject} className="flex-1"
                      onChange={e => updateStep(i, "subject", e.target.value)} />
                    <Button variant="outline" size="sm" className="text-xs whitespace-nowrap shrink-0"
                      onClick={() => { setTemplateForStep(i); setTemplatePickerOpen(true); }}>
                      📝 Template
                    </Button>
                  </div>
                  <Textarea ref={bodyRefs[i]} placeholder="Email body…" value={step.body_html}
                    onChange={e => updateStep(i, "body_html", e.target.value)}
                    className="min-h-[120px] text-sm font-mono" />
                  <div className="flex flex-wrap gap-1.5">
                    {VARIABLES.map(v => (
                      <button key={v} type="button" onClick={() => insertVariable(i, v)}
                        className="text-[11px] px-2 py-0.5 bg-[#eef2ff] text-[#6366f1] rounded border border-[#c7d2fe] hover:bg-[#e0e7ff] font-mono transition-colors">
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Step 4: Review */}
          {wizardStep === 4 && (
            <div className="space-y-4 py-2">
              <div className="bg-[#f9fafb] rounded-xl border border-[#e5e7eb] p-4 space-y-4">
                <h3 className="font-bold text-[#111827]">Campaign Summary</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div><span className="text-[#9ca3af] text-xs">Name</span><div className="font-semibold mt-0.5">{form.name}</div></div>
                  <div><span className="text-[#9ca3af] text-xs">Contact List</span><div className="font-semibold mt-0.5">{selectedList?.name ?? "—"}</div></div>
                  <div><span className="text-[#9ca3af] text-xs">Total Contacts</span><div className="font-semibold mt-0.5">{totalContacts}</div></div>
                  <div><span className="text-[#9ca3af] text-xs">Start Date</span><div className="font-semibold mt-0.5">{form.start_date ? new Date(form.start_date).toLocaleString("en-IN") : "—"}</div></div>
                </div>

                {/* Mailbox split preview */}
                <div>
                  <div className="text-xs text-[#9ca3af] font-semibold uppercase tracking-wide mb-2">Mailbox Split</div>
                  <div className="space-y-2">
                    {form.email_account_ids.map((aid, idx) => {
                      const acc = accounts.find(a => a.id === aid);
                      return (
                        <div key={aid} className="flex items-center justify-between bg-white rounded-lg border border-[#e5e7eb] px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-[#6366f1] text-white text-[10px] font-bold flex items-center justify-center">
                              {acc?.display_name[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-semibold">{acc?.display_name}</div>
                              <div className="text-xs text-[#9ca3af]">{acc?.email}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-[#6366f1]">
                              {idx < extraContacts ? perMailbox + 1 : perMailbox} leads
                            </div>
                            <div className="text-xs text-[#9ca3af]">{form.daily_limit}/day</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {mailboxCount > 1 && (
                    <div className="text-xs text-[#6b7280] mt-2 bg-[#f0f9ff] rounded p-2">
                      ⚡ Total: ~{form.daily_limit * mailboxCount} emails/day · Estimated completion: ~{Math.ceil(perMailbox / form.daily_limit)} days per step
                    </div>
                  )}
                </div>

                {/* Sequence */}
                <div>
                  <div className="text-xs text-[#9ca3af] font-semibold uppercase tracking-wide mb-2">Sequence</div>
                  {form.steps.map((s, i) => (
                    <div key={i} className="flex items-start gap-3 py-2 border-b border-[#f3f4f6] last:border-0">
                      <div className="w-5 h-5 rounded-full bg-[#6366f1] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[#9ca3af]">{i === 0 ? "Day 0" : `+${s.delay_days} days`}</div>
                        <div className="text-sm font-medium text-[#374151] truncate">{s.subject || "(no subject)"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between">
            <div>{wizardStep > 1 && <Button variant="ghost" onClick={() => setWizardStep(w => w - 1)}>← Back</Button>}</div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={closeWizard}>Cancel</Button>
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
                        <Play className="h-4 w-4 mr-1" /> {saveCampaign.isPending ? "Launching…" : "Launch Now"}
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(o) => { if (!o) setConfirmDeleteId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" /> Delete Campaign?
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-[#374151]">
              Are you sure you want to delete <strong>"{confirmDeleteName}"</strong>?
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 space-y-1">
              <div>⚠️ This will permanently delete:</div>
              <div className="pl-3 text-xs space-y-0.5">
                <div>• All scheduled & pending emails</div>
                <div>• All email sequence steps</div>
                <div>• All campaign stats</div>
              </div>
              <div className="text-xs font-semibold mt-1">This action cannot be undone.</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDeleteId) deleteCampaign.mutate(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
              disabled={deleteCampaign.isPending}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {deleteCampaign.isPending ? "Deleting…" : "Yes, Delete Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Picker */}
      <Dialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Choose a Template</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto py-2">
            {templates.length === 0 ? (
              <div className="text-center text-[#9ca3af] py-8">No templates yet.</div>
            ) : templates.map(t => (
              <div key={t.id} className="border border-[#e5e7eb] rounded-lg p-3 hover:bg-[#f9fafb] cursor-pointer transition-colors"
                onClick={() => applyTemplate(t)}>
                <div className="font-medium text-sm mb-1">{t.name}</div>
                <div className="text-xs text-[#6b7280] truncate">{t.subject}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
