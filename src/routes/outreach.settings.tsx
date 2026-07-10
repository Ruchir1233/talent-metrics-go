import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Eye, EyeOff, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase, type EmailAccount } from "@/lib/supabase";

export const Route = createFileRoute("/outreach/settings")({
  head: () => ({ meta: [{ title: "Email Accounts — Kaapro Outreach" }] }),
  component: OutreachSettingsPage,
});

type AccountForm = {
  display_name: string; email: string; provider: string;
  smtp_host: string; smtp_port: number;
  imap_host: string; imap_port: number;
  username: string; password: string; daily_limit: number;
};

const emptyForm = (): AccountForm => ({
  display_name: "", email: "", provider: "zoho",
  smtp_host: "smtppro.zoho.in", smtp_port: 465,
  imap_host: "imappro.zoho.in", imap_port: 993,
  username: "", password: "", daily_limit: 80,
});

function OutreachSettingsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm());
  const [showPass, setShowPass] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["email_accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_accounts").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as EmailAccount[];
    },
  });

  const setProvider = (provider: string) => {
    if (provider === "zoho") {
      setForm(f => ({ ...f, provider, smtp_host: "smtppro.zoho.in", smtp_port: 465, imap_host: "imappro.zoho.in", imap_port: 993 }));
    } else if (provider === "godaddy") {
      setForm(f => ({ ...f, provider, smtp_host: "smtpout.secureserver.net", smtp_port: 587, imap_host: "imap.secureserver.net", imap_port: 993 }));
    } else {
      setForm(f => ({ ...f, provider }));
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.display_name.trim()) throw new Error("Display name required");
      if (!form.email.trim()) throw new Error("Email required");
      if (!form.username.trim()) throw new Error("Username required");
      if (!form.password.trim()) throw new Error("Password required");
      const payload = { ...form, display_name: form.display_name.trim(), email: form.email.trim(), username: form.username.trim() };
      if (editingId) {
        const { error } = await supabase.from("email_accounts").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("email_accounts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Account updated" : "Account added");
      qc.invalidateQueries({ queryKey: ["email_accounts"] });
      setDialogOpen(false); setEditingId(null); setForm(emptyForm());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("email_accounts").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email_accounts"] }),
  });

  const testConnection = async (accountId: string) => {
    setTestingId(accountId);
    try {
      const { data, error } = await supabase.functions.invoke("test-smtp-connection", { body: { accountId } });
      if (error) throw error;
      toast.success("Connection successful ✓");
    } catch (e: any) {
      toast.error(e.message || "Connection failed");
    } finally {
      setTestingId(null);
    }
  };

  const openEdit = (a: EmailAccount) => {
    setEditingId(a.id);
    setForm({
      display_name: a.display_name, email: a.email, provider: a.provider,
      smtp_host: a.smtp_host, smtp_port: a.smtp_port,
      imap_host: a.imap_host, imap_port: a.imap_port,
      username: a.username, password: a.password, daily_limit: a.daily_limit,
    });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Email Accounts</h1>
          <p className="text-sm text-[#6b7280] mt-0.5">Manage mailboxes used for sending outreach campaigns.</p>
        </div>
        <Button onClick={() => { setEditingId(null); setForm(emptyForm()); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Account
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-[#9ca3af]">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-20 text-[#9ca3af]">
          <div className="text-5xl mb-3">📬</div>
          <div className="font-medium text-[#374151]">No email accounts yet</div>
          <div className="text-sm mt-1">Add a Zoho or GoDaddy mailbox to start sending</div>
        </div>
      ) : (
        <div className="grid gap-4">
          {accounts.map(a => {
            const pct = a.daily_limit > 0 ? Math.round((a.sent_today / a.daily_limit) * 100) : 0;
            return (
              <div key={a.id} className="bg-white border border-[#e5e7eb] rounded-xl p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-[#111827]">{a.display_name}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">{a.provider}</Badge>
                    </div>
                    <div className="text-sm text-[#6b7280]">{a.email}</div>
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-xs text-[#9ca3af]">
                        <span>Sent today</span>
                        <span>{a.sent_today} / {a.daily_limit}</span>
                      </div>
                      <Progress value={Math.min(pct, 100)} className="h-1.5" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <Button variant="outline" size="sm" disabled={testingId === a.id}
                      onClick={() => testConnection(a.id)}>
                      <Wifi className="h-3.5 w-3.5 mr-1" />
                      {testingId === a.id ? "Testing…" : "Test"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>Edit</Button>
                    <Switch checked={a.is_active} onCheckedChange={v => toggleActive.mutate({ id: a.id, is_active: v })} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setEditingId(null); setForm(emptyForm()); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Email Account" : "Add Email Account"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Display Name *</Label>
                <Input placeholder="Sales Mailbox" value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Provider *</Label>
                <Select value={form.provider} onValueChange={setProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zoho">Zoho Mail</SelectItem>
                    <SelectItem value="godaddy">GoDaddy</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email Address *</Label>
              <Input type="email" placeholder="sales@yourcompany.com" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value, username: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>SMTP Host</Label>
                <Input value={form.smtp_host} onChange={e => setForm({ ...form, smtp_host: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>SMTP Port</Label>
                <Input type="number" value={form.smtp_port} onChange={e => setForm({ ...form, smtp_port: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>IMAP Host</Label>
                <Input value={form.imap_host} onChange={e => setForm({ ...form, imap_host: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>IMAP Port</Label>
                <Input type="number" value={form.imap_port} onChange={e => setForm({ ...form, imap_port: Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Username *</Label>
              <Input placeholder="Usually same as email" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Password *</Label>
              <div className="relative">
                <Input type={showPass ? "text" : "password"} value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })} className="pr-10" />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151]">
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Daily Limit</Label>
              <Input type="number" min={1} max={500} value={form.daily_limit} onChange={e => setForm({ ...form, daily_limit: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDialogOpen(false); setEditingId(null); setForm(emptyForm()); }}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : editingId ? "Update" : "Add Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
