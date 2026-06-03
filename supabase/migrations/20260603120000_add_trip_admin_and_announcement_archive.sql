-- ─── Migration: trip_admin role + announcement archive ────────────────────────

-- 1. Expand role CHECK to include trip_admin
ALTER TABLE trip_members
  DROP CONSTRAINT IF EXISTS trip_members_role_check,
  ADD CONSTRAINT trip_members_role_check
    CHECK (role IN ('trip_organizer','trip_admin','family_admin','member','viewer'));

-- 2. Add is_archived column to announcements
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

-- 3. Helper: is_trip_admin
CREATE OR REPLACE FUNCTION is_trip_admin(trip_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_members
    WHERE trip_id = trip_uuid AND user_id = user_uuid AND role = 'trip_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 4. Helper: can_manage_announcements (organizer OR admin)
CREATE OR REPLACE FUNCTION can_manage_announcements(trip_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_members
    WHERE trip_id = trip_uuid AND user_id = user_uuid
      AND role IN ('trip_organizer','trip_admin')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 5. Replace announcement policies to allow trip_admin
DROP POLICY IF EXISTS "Organizers can create announcements" ON announcements;
DROP POLICY IF EXISTS "Organizers can manage announcements" ON announcements;
DROP POLICY IF EXISTS "Organizers can delete announcements" ON announcements;

CREATE POLICY "Organizers and admins can create announcements"
  ON announcements FOR INSERT
  WITH CHECK (
    can_manage_announcements(trip_id, auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "Organizers and admins can manage announcements"
  ON announcements FOR UPDATE
  USING (can_manage_announcements(trip_id, auth.uid()));

CREATE POLICY "Organizers and admins can delete announcements"
  ON announcements FOR DELETE
  USING (can_manage_announcements(trip_id, auth.uid()));
