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
  calls_made: number;
  cv_submitted: number;
  interviews_scheduled: number;
  interviews_attended: number;
  interview_no_shows: number;
  selections: number;
  offers_released: number;
  offer_drops: number;
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
] as const;

export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

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
  status_comment: string | null;
  created_at: string;
};
