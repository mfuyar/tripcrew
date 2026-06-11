-- ─── CRITICAL SECURITY FIX ──────────────────────────────────────────────────
-- The Supabase database linter found that 24 public tables (trips, expenses,
-- settlements, messages, profiles, family_members, live_locations, etc.)
-- have ROW LEVEL SECURITY DISABLED. Every row in these tables is currently
-- readable and writable by any API caller, regardless of any policy.
--
-- supabase/rls.sql — which contains `ALTER TABLE ... ENABLE ROW LEVEL
-- SECURITY` plus the original baseline policies for these tables — was
-- apparently never applied to this project. Every later migration that did
-- `DROP POLICY IF EXISTS old; CREATE POLICY new` assumed that baseline
-- existed, so several core tables are *also* missing basic policies the app
-- needs (e.g. profiles has no "insert own profile" policy, trip_members has
-- no view/join policy, messages has no send policy, trips has no create
-- policy, and poll_options/poll_votes-adjacent tables itinerary_attendance,
-- grocery_items, packing_items, car_passengers have zero policies at all).
--
-- This migration:
--   1. Restores is_trip_member / is_trip_organizer (same situation
--      can_manage_trip was in, fixed in 20260604160000 — is_trip_member was
--      only ever defined in rls.sql, never in a tracked migration).
--   2. Re-creates the missing baseline policies from rls.sql.
--   3. Enables RLS on all 24 affected tables.
--
-- NOTE: settlements' INSERT/UPDATE/DELETE policies depend on migrations
-- 20260607213000 / 214000 / 215000 (organizer-only settlement workflow)
-- being applied. Without those, settlements will be view-only once RLS is
-- enabled.

-- ─── Helper functions ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_trip_member(trip_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = trip_uuid AND user_id = user_uuid
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.is_trip_member(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_trip_organizer(trip_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = trip_uuid AND user_id = user_uuid AND role = 'trip_organizer'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.is_trip_organizer(uuid, uuid) TO authenticated;

-- ─── profiles ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- ─── trips ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can create trips" ON public.trips;
CREATE POLICY "Authenticated users can create trips"
  ON public.trips FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Trip organizers can delete trips" ON public.trips;
CREATE POLICY "Trip organizers can delete trips"
  ON public.trips FOR DELETE
  USING (public.is_trip_organizer(id, auth.uid()));

-- Allow looking up trips by invite code (for joining)
DROP POLICY IF EXISTS "Anyone can look up trips by invite code" ON public.trips;
CREATE POLICY "Anyone can look up trips by invite code"
  ON public.trips FOR SELECT
  USING (true);

-- ─── trip_members ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trip members can view membership" ON public.trip_members;
CREATE POLICY "Trip members can view membership"
  ON public.trip_members FOR SELECT
  USING (public.is_trip_member(trip_id, auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can join trips" ON public.trip_members;
CREATE POLICY "Authenticated users can join trips"
  ON public.trip_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Organizers can manage members, users can leave" ON public.trip_members;
CREATE POLICY "Organizers can manage members, users can leave"
  ON public.trip_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.is_trip_organizer(trip_id, auth.uid())
  );

-- ─── families ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trip members can view families" ON public.families;
CREATE POLICY "Trip members can view families"
  ON public.families FOR SELECT
  USING (public.is_trip_member(trip_id, auth.uid()));

-- ─── family_members ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trip members can view family members" ON public.family_members;
CREATE POLICY "Trip members can view family members"
  ON public.family_members FOR SELECT
  USING (public.is_trip_member(trip_id, auth.uid()));

DROP POLICY IF EXISTS "Trip members can add family members" ON public.family_members;
CREATE POLICY "Trip members can add family members"
  ON public.family_members FOR INSERT
  WITH CHECK (public.is_trip_member(trip_id, auth.uid()));

DROP POLICY IF EXISTS "Family members can update their push talk preference" ON public.family_members;
CREATE POLICY "Family members can update their push talk preference"
  ON public.family_members FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── messages ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trip members can send messages" ON public.messages;
CREATE POLICY "Trip members can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (public.is_trip_member(trip_id, auth.uid()) AND user_id = auth.uid());

-- ─── trip_media ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trip members can view media" ON public.trip_media;
CREATE POLICY "Trip members can view media"
  ON public.trip_media FOR SELECT
  USING (public.is_trip_member(trip_id, auth.uid()));

DROP POLICY IF EXISTS "Trip members can upload media" ON public.trip_media;
CREATE POLICY "Trip members can upload media"
  ON public.trip_media FOR INSERT
  WITH CHECK (public.is_trip_member(trip_id, auth.uid()) AND uploaded_by = auth.uid());

-- ─── itinerary_items ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trip members can view itinerary" ON public.itinerary_items;
CREATE POLICY "Trip members can view itinerary"
  ON public.itinerary_items FOR SELECT
  USING (public.is_trip_member(trip_id, auth.uid()));

DROP POLICY IF EXISTS "Trip members can create itinerary items" ON public.itinerary_items;
CREATE POLICY "Trip members can create itinerary items"
  ON public.itinerary_items FOR INSERT
  WITH CHECK (public.is_trip_member(trip_id, auth.uid()));

-- ─── itinerary_attendance ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trip members can manage attendance" ON public.itinerary_attendance;
CREATE POLICY "Trip members can manage attendance"
  ON public.itinerary_attendance FOR ALL
  USING (public.is_trip_member(trip_id, auth.uid()));

-- ─── grocery_items ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trip members can manage grocery items" ON public.grocery_items;
CREATE POLICY "Trip members can manage grocery items"
  ON public.grocery_items FOR ALL
  USING (public.is_trip_member(trip_id, auth.uid()));

-- ─── packing_items ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trip members can manage packing items" ON public.packing_items;
CREATE POLICY "Trip members can manage packing items"
  ON public.packing_items FOR ALL
  USING (public.is_trip_member(trip_id, auth.uid()));

-- ─── cars ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trip members can view cars" ON public.cars;
CREATE POLICY "Trip members can view cars"
  ON public.cars FOR SELECT
  USING (public.is_trip_member(trip_id, auth.uid()));

DROP POLICY IF EXISTS "Trip members can create cars" ON public.cars;
CREATE POLICY "Trip members can create cars"
  ON public.cars FOR INSERT
  WITH CHECK (public.is_trip_member(trip_id, auth.uid()));

-- ─── car_passengers ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trip members can manage car passengers" ON public.car_passengers;
CREATE POLICY "Trip members can manage car passengers"
  ON public.car_passengers FOR ALL
  USING (public.is_trip_member(trip_id, auth.uid()));

-- ─── polls ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trip members can view polls" ON public.polls;
CREATE POLICY "Trip members can view polls"
  ON public.polls FOR SELECT
  USING (public.is_trip_member(trip_id, auth.uid()));

-- ─── poll_options ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trip members can view and manage poll options" ON public.poll_options;
CREATE POLICY "Trip members can view and manage poll options"
  ON public.poll_options FOR ALL
  USING (public.is_trip_member(trip_id, auth.uid()));

-- ─── emergency_info ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trip members can view emergency info" ON public.emergency_info;
CREATE POLICY "Trip members can view emergency info"
  ON public.emergency_info FOR SELECT
  USING (public.is_trip_member(trip_id, auth.uid()));

DROP POLICY IF EXISTS "Trip members can add emergency info" ON public.emergency_info;
CREATE POLICY "Trip members can add emergency info"
  ON public.emergency_info FOR INSERT
  WITH CHECK (public.is_trip_member(trip_id, auth.uid()) AND added_by = auth.uid());

-- ─── announcements ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Trip members can view announcements" ON public.announcements;
CREATE POLICY "Trip members can view announcements"
  ON public.announcements FOR SELECT
  USING (public.is_trip_member(trip_id, auth.uid()));

-- ─── notifications ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

-- ─── Enable RLS on all affected tables ─────────────────────────────────────
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.car_passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
