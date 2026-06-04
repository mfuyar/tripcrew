-- Global admins can manage trip membership from the admin console.
-- This lets the app show every trip's members and remove/restrict/promote users
-- even when the global admin is not personally a member of that trip.

CREATE OR REPLACE FUNCTION public.can_manage_announcements(trip_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT public.is_global_admin(user_uuid) OR EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = trip_uuid AND user_id = user_uuid
      AND role IN ('trip_organizer','trip_admin')
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_manage_trip(trip_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT public.can_manage_announcements(trip_uuid, user_uuid);
$$ LANGUAGE sql SECURITY DEFINER;

DROP POLICY IF EXISTS "Global admin can view profiles" ON public.profiles;
CREATE POLICY "Global admin can view profiles"
  ON public.profiles FOR SELECT
  USING (is_global_admin(auth.uid()));

DROP POLICY IF EXISTS "Global admin can update trip memberships" ON public.trip_members;
CREATE POLICY "Global admin can update trip memberships"
  ON public.trip_members FOR UPDATE
  USING (is_global_admin(auth.uid()))
  WITH CHECK (is_global_admin(auth.uid()));

DROP POLICY IF EXISTS "Global admin can delete trip memberships" ON public.trip_members;
CREATE POLICY "Global admin can delete trip memberships"
  ON public.trip_members FOR DELETE
  USING (is_global_admin(auth.uid()));

DROP POLICY IF EXISTS "Global admin can update family memberships" ON public.family_members;
CREATE POLICY "Global admin can update family memberships"
  ON public.family_members FOR UPDATE
  USING (is_global_admin(auth.uid()))
  WITH CHECK (is_global_admin(auth.uid()));

DROP POLICY IF EXISTS "Global admin can delete family memberships" ON public.family_members;
CREATE POLICY "Global admin can delete family memberships"
  ON public.family_members FOR DELETE
  USING (is_global_admin(auth.uid()));

DROP POLICY IF EXISTS "Global admin can update families" ON public.families;
CREATE POLICY "Global admin can update families"
  ON public.families FOR UPDATE
  USING (is_global_admin(auth.uid()))
  WITH CHECK (is_global_admin(auth.uid()));

DROP POLICY IF EXISTS "Global admin can delete families" ON public.families;
CREATE POLICY "Global admin can delete families"
  ON public.families FOR DELETE
  USING (is_global_admin(auth.uid()));
