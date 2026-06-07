import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "[TalentFlow] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
      "Add them to your .env to connect to your external Supabase project.",
  );
}

export const supabase = createClient(url ?? "http://localhost", anonKey ?? "public-anon-key", {
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
