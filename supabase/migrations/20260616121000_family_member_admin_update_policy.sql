-- Allow trip managers (organizer + admin) to update family_members rows
-- in their trip. Previously only the member themselves could update their
-- own row (push-talk toggle), so setFamilyMemberAdmin silently matched 0
-- rows and PostgREST returned "Cannot coerce the result to a single JSON object".
DROP POLICY IF EXISTS "Trip managers can update family member roles" ON public.family_members;
CREATE POLICY "Trip managers can update family member roles"
  ON public.family_members FOR UPDATE
  USING (public.can_manage_trip(trip_id, auth.uid()))
  WITH CHECK (public.can_manage_trip(trip_id, auth.uid()));
