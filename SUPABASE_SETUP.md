# TalentFlow — External Supabase Setup

This app is built to connect to **your own** Supabase project. Nothing is provisioned by Lovable.

## 1. Credentials

Credentials are hardcoded in `src/integrations/supabase/config.ts`.

## 2. Create the tables

Open your Supabase project → **SQL Editor** → run:

```sql
-- Recruiters
create table if not exists public.recruiters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  designation text not null,
  years_of_experience numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Daily Reports
create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  recruiter_name text not null,
  calls_made integer not null default 0,
  cv_submitted integer not null default 0,
  interviews_scheduled integer not null default 0,
  interviews_attended integer not null default 0,
  interview_no_shows integer not null default 0,
  selections integer not null default 0,
  offers_released integer not null default 0,
  offer_drops integer not null default 0,
  joinings integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique (date, recruiter_name)
);

-- Candidates (Live Pipeline)
create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  position_name text not null,
  location text,
  ctc text,
  candidate_name text not null,
  crm_owner text,
  source_recruiter text,
  stage text not null default 'Submitted',
  date_sourced date,
  next_action text,
  next_action_date date,
  status_comment text,
  created_at timestamptz not null default now()
);

-- Month Settings (Phase 3)
create table if not exists public.month_settings (
  id uuid primary key default gen_random_uuid(),
  month integer not null,
  year integer not null,
  working_days integer not null default 0,
  created_at timestamptz not null default now(),
  unique (month, year)
);

-- Monthly Targets (Phase 3)
create table if not exists public.monthly_targets (
  id uuid primary key default gen_random_uuid(),
  recruiter_name text not null,
  calls_target integer not null default 0,
  submissions_target integer not null default 0,
  interviews_scheduled_target integer not null default 0,
  interviews_attended_target integer not null default 0,
  selections_target integer not null default 0,
  offers_target integer not null default 0,
  joinings_target integer not null default 0,
  month integer not null,
  year integer not null,
  created_at timestamptz not null default now(),
  unique (recruiter_name, month, year)
);

-- Open access (no auth in this app)
alter table public.recruiters enable row level security;
alter table public.daily_reports enable row level security;
alter table public.candidates enable row level security;
alter table public.month_settings enable row level security;
alter table public.monthly_targets enable row level security;

create policy "public read recruiters" on public.recruiters for select using (true);
create policy "public write recruiters" on public.recruiters for all using (true) with check (true);
create policy "public read reports" on public.daily_reports for select using (true);
create policy "public write reports" on public.daily_reports for all using (true) with check (true);
create policy "public read candidates" on public.candidates for select using (true);
create policy "public write candidates" on public.candidates for all using (true) with check (true);
create policy "public read month_settings" on public.month_settings for select using (true);
create policy "public write month_settings" on public.month_settings for all using (true) with check (true);
create policy "public read monthly_targets" on public.monthly_targets for select using (true);
create policy "public write monthly_targets" on public.monthly_targets for all using (true) with check (true);
```
