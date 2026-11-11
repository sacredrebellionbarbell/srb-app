-- Sacred Rebellion Barbell nutrition tracking
-- Applied to Supabase on 2026-11-11. Kept here as the repository record.

create table if not exists public.nutrition_targets (
  athlete_id uuid primary key references public.profiles(id) on delete cascade,
  calorie_target integer not null default 0 check (calorie_target >= 0),
  protein_target numeric(8,2) not null default 0 check (protein_target >= 0),
  carb_target numeric(8,2) not null default 0 check (carb_target >= 0),
  fat_target numeric(8,2) not null default 0 check (fat_target >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nutrition_entries (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null,
  meal text not null default 'Meal' check (meal in ('Breakfast', 'Lunch', 'Dinner', 'Snack', 'Meal')),
  food_name text not null,
  serving_amount numeric(10,2),
  serving_unit text,
  calories numeric(10,2) not null default 0 check (calories >= 0),
  protein numeric(10,2) not null default 0 check (protein >= 0),
  carbs numeric(10,2) not null default 0 check (carbs >= 0),
  fat numeric(10,2) not null default 0 check (fat >= 0),
  source text not null default 'manual' check (source in ('manual', 'search', 'barcode', 'photo')),
  source_id text,
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nutrition_entries_athlete_date_idx
  on public.nutrition_entries (athlete_id, log_date, created_at);

create table if not exists public.nutrition_diary_days (
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null,
  completed_at timestamptz,
  coach_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (athlete_id, log_date)
);

alter table public.nutrition_targets enable row level security;
alter table public.nutrition_entries enable row level security;
alter table public.nutrition_diary_days enable row level security;

grant select, insert, update, delete on public.nutrition_targets to authenticated;
grant select, insert, update, delete on public.nutrition_entries to authenticated;
grant select, insert, update, delete on public.nutrition_diary_days to authenticated;

drop policy if exists "Athletes view own nutrition targets" on public.nutrition_targets;
create policy "Athletes view own nutrition targets"
on public.nutrition_targets for select to authenticated
using (
  (athlete_id = (select auth.uid()) and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.membership_type in ('Class Access', 'Open Gym', 'Personal Training', 'Online Training', 'Nutrition', 'Nutrition Coaching', 'Hybrid Training', 'Both', 'Founding Membership')
  ))
  or exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid()) and profiles.role = 'coach'
  )
);

drop policy if exists "Coaches manage nutrition targets" on public.nutrition_targets;
create policy "Coaches manage nutrition targets"
on public.nutrition_targets for all to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid()) and profiles.role = 'coach'
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid()) and profiles.role = 'coach'
  )
);

drop policy if exists "Athletes manage own nutrition entries" on public.nutrition_entries;
create policy "Athletes manage own nutrition entries"
on public.nutrition_entries for all to authenticated
using (
  athlete_id = (select auth.uid()) and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.membership_type in ('Class Access', 'Open Gym', 'Personal Training', 'Online Training', 'Nutrition', 'Nutrition Coaching', 'Hybrid Training', 'Both', 'Founding Membership')
  )
)
with check (
  athlete_id = (select auth.uid()) and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.membership_type in ('Class Access', 'Open Gym', 'Personal Training', 'Online Training', 'Nutrition', 'Nutrition Coaching', 'Hybrid Training', 'Both', 'Founding Membership')
  )
);

drop policy if exists "Coaches view nutrition entries" on public.nutrition_entries;
create policy "Coaches view nutrition entries"
on public.nutrition_entries for select to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid()) and profiles.role = 'coach'
  )
);

drop policy if exists "Athletes manage own nutrition diary" on public.nutrition_diary_days;
create policy "Athletes manage own nutrition diary"
on public.nutrition_diary_days for all to authenticated
using (
  athlete_id = (select auth.uid()) and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.membership_type in ('Class Access', 'Open Gym', 'Personal Training', 'Online Training', 'Nutrition', 'Nutrition Coaching', 'Hybrid Training', 'Both', 'Founding Membership')
  )
)
with check (
  athlete_id = (select auth.uid()) and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.membership_type in ('Class Access', 'Open Gym', 'Personal Training', 'Online Training', 'Nutrition', 'Nutrition Coaching', 'Hybrid Training', 'Both', 'Founding Membership')
  )
);

drop policy if exists "Coaches view nutrition diaries" on public.nutrition_diary_days;
create policy "Coaches view nutrition diaries"
on public.nutrition_diary_days for select to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid()) and profiles.role = 'coach'
  )
);
