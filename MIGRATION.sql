-- ============================================================
-- STEP 1: Create positions master table
-- ============================================================
create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  position_name text not null,
  location text,
  ctc text,
  description text,
  status text not null default 'Open',   -- Open / On Hold / Closed
  shared_with_surat boolean not null default false,
  date_opened date default current_date,
  created_at timestamptz default now()
);

-- ============================================================
-- STEP 2: Migrate existing unique positions from candidates
-- (case-insensitive dedup using LOWER+TRIM)
-- ============================================================
insert into public.positions (client_name, position_name, location, ctc, date_opened)
select distinct on (lower(trim(client_name)), lower(trim(position_name)))
  initcap(trim(client_name))    as client_name,
  initcap(trim(position_name))  as position_name,
  min(location)                 as location,
  min(ctc)                      as ctc,
  min(date_sourced)             as date_opened
from public.candidates
where client_name is not null and position_name is not null
group by lower(trim(client_name)), lower(trim(position_name));

-- ============================================================
-- STEP 3: Add position_id column to candidates
-- ============================================================
alter table public.candidates
  add column if not exists position_id uuid references public.positions(id);

-- ============================================================
-- STEP 4: Link existing candidates to their position
-- ============================================================
update public.candidates c
set position_id = p.id
from public.positions p
where lower(trim(c.client_name)) = lower(trim(p.client_name))
  and lower(trim(c.position_name)) = lower(trim(p.position_name));

-- ============================================================
-- STEP 5: Verify — run this SELECT to check results
-- ============================================================
select
  p.client_name,
  p.position_name,
  p.status,
  p.shared_with_surat,
  count(c.id) as candidate_count
from public.positions p
left join public.candidates c on c.position_id = p.id
group by p.id, p.client_name, p.position_name, p.status, p.shared_with_surat
order by p.client_name, p.position_name;
