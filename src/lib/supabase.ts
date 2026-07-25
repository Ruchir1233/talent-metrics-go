import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/integrations/supabase/config";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

export type Recruiter = {
  id: string;
  name: string;
  email: string | null;
  job_role: "Recruiter" | "Branch Head" | "BDE";
  years_of_experience: number;
  active: boolean;
  created_at: string;
};

export type PositionWorked = {
  position_name: string;
  client_name: string;
  cv_count: number;
};

export type DailyReport = {
  id: string;
  date: string;
  recruiter_name: string;
  cv_submitted: number;
  interviews_scheduled: number;
  joinings: number;
  notes: string | null;
  remarks: string | null;
  positions_worked: PositionWorked[] | null;
  created_at: string;
};

export const CANDIDATE_STAGES = [
  "Submitted",
  "Interview Scheduled",
  "Interview Attended",
  "Selected",
  "Offered",
  "Not Responding",
  "Rejected",
  "Joined",
] as const;

export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

export const INACTIVE_STAGES: CandidateStage[] = ["Joined", "Rejected", "Not Responding"];

export const STAGE_BADGE_CLASS: Record<string, string> = {
  Submitted: "bg-muted text-foreground border-border",
  "Interview Scheduled": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "Interview Attended": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  Selected: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  Offered: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Not Responding": "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  Rejected: "bg-red-500/20 text-red-300 border-red-500/30",
  Joined: "bg-green-500/20 text-green-300 border-green-500/30",
};

export type Candidate = {
  id: string;
  client_name: string;
  position_name: string;
  location: string | null;
  ctc: string | null;
  candidate_name: string;
  crm_owner: string | null;
  source_recruiter: string | null;
  stage: CandidateStage | string;
  date_sourced: string | null;
  next_action: string | null;
  next_action_date: string | null;
  position_id: string | null;
  phone: string | null;
  interview_date: string | null;
  interview_time: string | null;
  status_comment: string | null;
  created_at: string;
};

export type MonthSetting = {
  id: string;
  month: number;
  year: number;
  working_days: number;
  created_at: string;
};



export type Todo = {
  id: string;
  title: string;
  notes: string | null;
  priority: "High" | "Medium" | "Normal";
  type: "Daily" | "One-time";
  custom_date: string | null;
  done: boolean;
  created_at: string;
};

export type TodoRecipient = {
  id: string;
  todo_id: string;
  recruiter_id: string;
};

export type Position = {
  id: string;
  client_name: string;
  position_name: string;
  location: string | null;
  ctc: string | null;
  description: string | null;
  status: "Open" | "On Hold" | "Closed";
  recruiter_id: string | null;
  shared_with_surat: boolean;
  surat_recruiter_name: string | null;
  surat_cv_count: number;
  date_opened: string | null;
  is_posted: boolean;
  created_at: string;
};

export type MonthlyTarget = {
  id: string;
  recruiter_name: string;
  submissions_target: number;
  interviews_scheduled_target: number;
  offers_target: number;
  joinings_target: number;
  month: number;
  year: number;
  created_at: string;
};

export type EmailAccount = {
  id: string;
  display_name: string;
  email: string;
  provider: string;
  smtp_host: string;
  smtp_port: number;
  imap_host: string;
  imap_port: number;
  username: string;
  password: string;
  daily_limit: number;
  sent_today: number;
  last_reset_date: string | null;
  is_active: boolean;
  created_at: string;
};

export type ContactList = {
  id: string;
  name: string;
  created_at: string;
};

export type ClientLead = {
  id: string;
  list_id: string | null;
  company_name: string | null;
  person_name: string | null;
  email: string;
  phone: string | null;
  industry: string | null;
  location: string | null;
  pipeline_stage: string;
  has_replied: boolean;
  is_unsubscribed: boolean;
  is_bounced: boolean;
  created_at: string;
  updated_at: string;
};

export type Campaign = {
  id: string;
  name: string;
  email_account_id: string | null;
  contact_list_id: string | null;
  status: string;
  start_date: string | null;
  daily_limit: number;
  total_contacts: number;
  total_sent: number;
  total_opened: number;
  total_replied: number;
  total_bounced: number;
  created_at: string;
};

export type CampaignStep = {
  id: string;
  campaign_id: string;
  step_number: number;
  delay_days: number;
  subject: string;
  body_html: string;
  created_at: string;
};

export type EmailTemplate = {
  id: string;
  name: string;
  category: string | null;
  type: string;
  subject: string;
  body_html: string;
  created_at: string;
  updated_at: string;
};

export type LeadNote = {
  id: string;
  contact_id: string;
  content: string;
  created_at: string;
};

export type CampaignMailbox = {
  id: string;
  campaign_id: string;
  email_account_id: string;
  assigned_contacts: number;
  sent_count: number;
  replied_count: number;
  bounced_count: number;
  created_at: string;
};
