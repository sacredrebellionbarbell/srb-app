-- Allow coaches to use their own nutrition diary while retaining read access
-- to athlete diaries. Target management was already available to coaches.

drop policy if exists "Coaches manage own nutrition entries" on public.nutrition_entries;
create policy "Coaches manage own nutrition entries"
on public.nutrition_entries for all to authenticated
using (
  athlete_id = (select auth.uid()) and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid()) and profiles.role = 'coach'
  )
)
with check (
  athlete_id = (select auth.uid()) and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid()) and profiles.role = 'coach'
  )
);

drop policy if exists "Coaches manage own nutrition diary" on public.nutrition_diary_days;
create policy "Coaches manage own nutrition diary"
on public.nutrition_diary_days for all to authenticated
using (
  athlete_id = (select auth.uid()) and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid()) and profiles.role = 'coach'
  )
)
with check (
  athlete_id = (select auth.uid()) and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid()) and profiles.role = 'coach'
  )
);
