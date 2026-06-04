-- ─── Global Admin RLS bypass + soft-delete support ────────────────────────────

-- 1. Add is_held (soft-delete / violation hold) columns
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS is_held BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS held_reason TEXT;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_held BOOLEAN NOT NULL DEFAULT false;

-- 2. Filter held rows from normal member queries
-- trips: members cannot see held trips, but global admin can
DROP POLICY IF EXISTS "Trip members can view their trips" ON public.trips;
CREATE POLICY "Trip members can view their trips"
  ON public.trips FOR SELECT
  USING (
    (is_held = false AND is_trip_member(id, auth.uid()))
    OR is_global_admin(auth.uid())
  );

-- messages: held messages hidden from members, visible to global admin
DROP POLICY IF EXISTS "Trip members can view messages" ON public.messages;
CREATE POLICY "Trip members can view messages"
  ON public.messages FOR SELECT
  USING (
    (is_held = false AND is_trip_member(trip_id, auth.uid()))
    OR is_global_admin(auth.uid())
  );

-- 3. Global admin SELECT bypass for all remaining trip-data tables
CREATE POLICY "Global admin can view all trip memberships"
  ON public.trip_members FOR SELECT
  USING (is_global_admin(auth.uid()));

CREATE POLICY "Global admin can view all families"
  ON public.families FOR SELECT
  USING (is_global_admin(auth.uid()));

CREATE POLICY "Global admin can view all family members"
  ON public.family_members FOR SELECT
  USING (is_global_admin(auth.uid()));

CREATE POLICY "Global admin can view all expenses"
  ON public.expenses FOR SELECT
  USING (is_global_admin(auth.uid()));

CREATE POLICY "Global admin can view all expense splits"
  ON public.expense_splits FOR SELECT
  USING (is_global_admin(auth.uid()));

CREATE POLICY "Global admin can view all announcements"
  ON public.announcements FOR SELECT
  USING (is_global_admin(auth.uid()));

CREATE POLICY "Global admin can view all media"
  ON public.trip_media FOR SELECT
  USING (is_global_admin(auth.uid()));

CREATE POLICY "Global admin can view all polls"
  ON public.polls FOR SELECT
  USING (is_global_admin(auth.uid()));

-- 4. Global admin can hold/unhold trips and messages
CREATE POLICY "Global admin can update trips"
  ON public.trips FOR UPDATE
  USING (is_global_admin(auth.uid()));

CREATE POLICY "Global admin can update messages"
  ON public.messages FOR UPDATE
  USING (is_global_admin(auth.uid()));

-- 5. Global admin can hard-delete trips if needed
CREATE POLICY "Global admin can delete trips"
  ON public.trips FOR DELETE
  USING (is_global_admin(auth.uid()));
