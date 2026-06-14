import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/integrations/supabase/config";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

export type Recruiter = {
  id: string;
  name: string;
  designation: string;
  years_of_experience: number;
  active: boolean;
  created_at: string;
};

export type DailyReport = {
  id: string;
  date: string;
  recruiter_name: string;
  cv_submitted: number;
  interviews_scheduled: number;
  joinings: number;
  notes: string | null;
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
