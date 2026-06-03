-- ─── Migration: restrict expense + poll creation to trip organizers and admins ─

-- Expenses: only organizer or trip_admin can create new expenses
DROP POLICY IF EXISTS "Trip members can create expenses" ON expenses;
CREATE POLICY "Admins can create expenses"
  ON expenses FOR INSERT
  WITH CHECK (can_manage_announcements(trip_id, auth.uid()) AND paid_by_user_id = auth.uid());

-- Polls: only organizer or trip_admin can create new polls
DROP POLICY IF EXISTS "Trip members can create polls" ON polls;
CREATE POLICY "Admins can create polls"
  ON polls FOR INSERT
  WITH CHECK (can_manage_announcements(trip_id, auth.uid()));

-- Note: can_manage_announcements() was introduced in migration 20260603120000
-- It checks role IN ('trip_organizer','trip_admin').
-- Regular members retain SELECT, UPDATE (own rows), and DELETE (own rows) as before.
