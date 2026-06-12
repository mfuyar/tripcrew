-- Diagnostic queries for the "new row violates row-level security policy
-- for table expenses" error. Run each block in the Supabase SQL Editor.

-- 1. Your user id + global admin status
select p.id as user_id, p.email, p.full_name,
       exists(select 1 from public.global_admins ga where ga.user_id = p.id) as is_global_admin
from public.profiles p
where p.email = 'mfuyar@gmail.com';

-- 2. Find the trip(s) containing "Yıldırım Family" / "İlter Family"
select f.id as family_id, f.name as family_name, f.trip_id, t.name as trip_name, t.created_by
from public.families f
join public.trips t on t.id = f.trip_id
where f.name in ('Yıldırım Family', 'İlter Family');

-- 3. Your trip_members row (if any) for that trip — replace <TRIP_ID> with the
-- trip_id from query 2
select tm.*
from public.trip_members tm
join public.profiles p on p.id = tm.user_id
where p.email = 'mfuyar@gmail.com'
  and tm.trip_id = '<TRIP_ID>';

-- 4. Current INSERT policy definition on public.expenses (confirms which
-- migration's policy is actually live)
select polname, pg_get_expr(polwithcheck, polrelid) as with_check
from pg_policy
where polrelid = 'public.expenses'::regclass
  and polcmd = 'a'; -- 'a' = INSERT

-- 5. Sanity check the helper functions exist and what they return for you,
-- replace <TRIP_ID> as above
select
  public.is_global_admin(p.id) as is_global_admin,
  public.can_view_trip_expenses('<TRIP_ID>'::uuid, p.id) as can_view_trip_expenses,
  public.can_manage_trip('<TRIP_ID>'::uuid, p.id) as can_manage_trip,
  public.is_trip_member('<TRIP_ID>'::uuid, p.id) as is_trip_member
from public.profiles p
where p.email = 'mfuyar@gmail.com';
