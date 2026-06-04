-- ─── TripCrew Row Level Security Policies ─────────────────────────────────────
-- Enable RLS on all tables and add policies.

-- Helper function: checks if the current user is a member of a trip
CREATE OR REPLACE FUNCTION is_trip_member(trip_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_members
    WHERE trip_id = trip_uuid AND user_id = user_uuid
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function: checks if user is trip organizer
CREATE OR REPLACE FUNCTION is_trip_organizer(trip_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_members
    WHERE trip_id = trip_uuid AND user_id = user_uuid AND role = 'trip_organizer'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function: checks if user is trip admin
CREATE OR REPLACE FUNCTION is_trip_admin(trip_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_members
    WHERE trip_id = trip_uuid AND user_id = user_uuid AND role = 'trip_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function: checks if user can manage announcements (organizer or admin)
CREATE OR REPLACE FUNCTION can_manage_announcements(trip_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM trip_members
    WHERE trip_id = trip_uuid AND user_id = user_uuid
      AND role IN ('trip_organizer','trip_admin')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function: checks if user can manage trip content (organizer or admin)
CREATE OR REPLACE FUNCTION can_manage_trip(trip_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT can_manage_announcements(trip_uuid, user_uuid);
$$ LANGUAGE sql SECURITY DEFINER;

-- ─── profiles ─────────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can view profiles of trip members"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trip_members tm1
      JOIN trip_members tm2 ON tm1.trip_id = tm2.trip_id
      WHERE tm1.user_id = auth.uid() AND tm2.user_id = profiles.id
    )
  );

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- ─── trips ────────────────────────────────────────────────────────────────────
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can view their trips"
  ON trips FOR SELECT
  USING (is_trip_member(id, auth.uid()));

CREATE POLICY "Authenticated users can create trips"
  ON trips FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Trip organizers can update trips"
  ON trips FOR UPDATE
  USING (is_trip_organizer(id, auth.uid()));

CREATE POLICY "Trip organizers can delete trips"
  ON trips FOR DELETE
  USING (is_trip_organizer(id, auth.uid()));

-- Allow looking up trips by invite code (for joining)
CREATE POLICY "Anyone can look up trips by invite code"
  ON trips FOR SELECT
  USING (true);

-- ─── trip_members ─────────────────────────────────────────────────────────────
ALTER TABLE trip_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can view membership"
  ON trip_members FOR SELECT
  USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "Authenticated users can join trips"
  ON trip_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Organizers can manage members, users can leave"
  ON trip_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR is_trip_organizer(trip_id, auth.uid())
  );

CREATE POLICY "Organizers can update member roles"
  ON trip_members FOR UPDATE
  USING (can_manage_trip(trip_id, auth.uid()));

-- ─── families ─────────────────────────────────────────────────────────────────
ALTER TABLE families ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can view families"
  ON families FOR SELECT
  USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "Trip members can create families"
  ON families FOR INSERT
  WITH CHECK (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "Family creators and organizers can update families"
  ON families FOR UPDATE
  USING (
    created_by = auth.uid()
    OR can_manage_trip(trip_id, auth.uid())
  );

CREATE POLICY "Family creators and organizers can delete families"
  ON families FOR DELETE
  USING (
    created_by = auth.uid()
    OR can_manage_trip(trip_id, auth.uid())
  );

-- ─── family_members ───────────────────────────────────────────────────────────
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can view family members"
  ON family_members FOR SELECT
  USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "Trip members can add family members"
  ON family_members FOR INSERT
  WITH CHECK (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "Family members can update their push talk preference"
  ON family_members FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Family admins and organizers can remove members"
  ON family_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR can_manage_trip(trip_id, auth.uid())
  );

-- ─── expenses ─────────────────────────────────────────────────────────────────
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can view expenses"
  ON expenses FOR SELECT
  USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "Admins can create expenses"
  ON expenses FOR INSERT
  WITH CHECK (can_manage_announcements(trip_id, auth.uid()) AND paid_by_user_id = auth.uid());

CREATE POLICY "Expense creators and organizers can update expenses"
  ON expenses FOR UPDATE
  USING (
    paid_by_user_id = auth.uid()
    OR can_manage_trip(trip_id, auth.uid())
  );

CREATE POLICY "Expense creators and organizers can delete expenses"
  ON expenses FOR DELETE
  USING (
    paid_by_user_id = auth.uid()
    OR can_manage_trip(trip_id, auth.uid())
  );

-- ─── expense_splits ───────────────────────────────────────────────────────────
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can view splits"
  ON expense_splits FOR SELECT
  USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "Trip members can manage splits"
  ON expense_splits FOR ALL
  USING (is_trip_member(trip_id, auth.uid()));

-- ─── settlements ──────────────────────────────────────────────────────────────
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can view settlements"
  ON settlements FOR SELECT
  USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "Trip members can create settlements"
  ON settlements FOR INSERT
  WITH CHECK (is_trip_member(trip_id, auth.uid()));

DROP POLICY IF EXISTS "Trip members can update settlement status" ON settlements;
DROP POLICY IF EXISTS "Settlement payer or receiver can update status" ON settlements;

CREATE POLICY "Settlement payer or receiver can update status"
  ON settlements FOR UPDATE
  USING (
    is_trip_member(trip_id, auth.uid())
    AND (
      (status IN ('pending', 'disputed') AND EXISTS (
        SELECT 1 FROM family_members
        WHERE family_members.family_id = settlements.from_family_id
          AND family_members.user_id = auth.uid()
      ))
      OR (status = 'paid' AND EXISTS (
        SELECT 1 FROM family_members
        WHERE family_members.family_id = settlements.to_family_id
          AND family_members.user_id = auth.uid()
      ))
      OR can_manage_trip(trip_id, auth.uid())
    )
  );

-- ─── messages ─────────────────────────────────────────────────────────────────
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can view messages"
  ON messages FOR SELECT
  USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "Trip members can send messages"
  ON messages FOR INSERT
  WITH CHECK (is_trip_member(trip_id, auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Users can edit their own text messages"
  ON messages FOR UPDATE
  USING (
    is_trip_member(trip_id, auth.uid())
    AND user_id = auth.uid()
    AND message_type = 'text'
  )
  WITH CHECK (
    is_trip_member(trip_id, auth.uid())
    AND user_id = auth.uid()
    AND message_type = 'text'
  );

CREATE POLICY "Trip members can delete expired chat media messages"
  ON messages FOR DELETE
  USING (
    is_trip_member(trip_id, auth.uid())
    AND message_type IN ('image', 'audio')
    AND media_url IS NOT NULL
    AND created_at < NOW() - INTERVAL '24 hours'
    AND (
      message_type = 'audio'
      OR media_url LIKE '%/trip-media/chat/%'
    )
  );

-- ─── trip_media ───────────────────────────────────────────────────────────────
ALTER TABLE trip_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can view media"
  ON trip_media FOR SELECT
  USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "Trip members can upload media"
  ON trip_media FOR INSERT
  WITH CHECK (is_trip_member(trip_id, auth.uid()) AND uploaded_by = auth.uid());

CREATE POLICY "Uploaders and organizers can delete media"
  ON trip_media FOR DELETE
  USING (
    uploaded_by = auth.uid()
    OR can_manage_trip(trip_id, auth.uid())
  );

CREATE POLICY "Uploaders can update captions"
  ON trip_media FOR UPDATE
  USING (uploaded_by = auth.uid() OR can_manage_trip(trip_id, auth.uid()));

-- ─── itinerary_items ──────────────────────────────────────────────────────────
ALTER TABLE itinerary_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can view itinerary"
  ON itinerary_items FOR SELECT
  USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "Trip members can create itinerary items"
  ON itinerary_items FOR INSERT
  WITH CHECK (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "Creators and organizers can update items"
  ON itinerary_items FOR UPDATE
  USING (created_by = auth.uid() OR can_manage_trip(trip_id, auth.uid()));

CREATE POLICY "Creators and organizers can delete items"
  ON itinerary_items FOR DELETE
  USING (created_by = auth.uid() OR can_manage_trip(trip_id, auth.uid()));

-- ─── itinerary_attendance ─────────────────────────────────────────────────────
ALTER TABLE itinerary_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can manage attendance"
  ON itinerary_attendance FOR ALL
  USING (is_trip_member(trip_id, auth.uid()));

-- ─── grocery_items ────────────────────────────────────────────────────────────
ALTER TABLE grocery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can manage grocery items"
  ON grocery_items FOR ALL
  USING (is_trip_member(trip_id, auth.uid()));

-- ─── packing_items ────────────────────────────────────────────────────────────
ALTER TABLE packing_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can manage packing items"
  ON packing_items FOR ALL
  USING (is_trip_member(trip_id, auth.uid()));

-- ─── cars ─────────────────────────────────────────────────────────────────────
ALTER TABLE cars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can view cars"
  ON cars FOR SELECT
  USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "Trip members can create cars"
  ON cars FOR INSERT
  WITH CHECK (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "Car creators and organizers can manage cars"
  ON cars FOR UPDATE
  USING (created_by = auth.uid() OR can_manage_trip(trip_id, auth.uid()));

CREATE POLICY "Car creators and organizers can delete cars"
  ON cars FOR DELETE
  USING (created_by = auth.uid() OR can_manage_trip(trip_id, auth.uid()));

-- ─── car_passengers ───────────────────────────────────────────────────────────
ALTER TABLE car_passengers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can manage car passengers"
  ON car_passengers FOR ALL
  USING (is_trip_member(trip_id, auth.uid()));

-- ─── polls ────────────────────────────────────────────────────────────────────
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can view polls"
  ON polls FOR SELECT
  USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "Admins can create polls"
  ON polls FOR INSERT
  WITH CHECK (can_manage_announcements(trip_id, auth.uid()));

CREATE POLICY "Poll creators and organizers can update polls"
  ON polls FOR UPDATE
  USING (created_by = auth.uid() OR can_manage_announcements(trip_id, auth.uid()));

CREATE POLICY "Admins can delete polls"
  ON polls FOR DELETE
  USING (can_manage_announcements(trip_id, auth.uid()));

-- ─── poll_options ─────────────────────────────────────────────────────────────
ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can view and manage poll options"
  ON poll_options FOR ALL
  USING (is_trip_member(trip_id, auth.uid()));

-- ─── poll_votes ───────────────────────────────────────────────────────────────
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can view and cast votes"
  ON poll_votes FOR ALL
  USING (is_trip_member(trip_id, auth.uid()));

-- ─── receipt_scans ────────────────────────────────────────────────────────────
ALTER TABLE receipt_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can manage receipt scans"
  ON receipt_scans FOR ALL
  USING (is_trip_member(trip_id, auth.uid()))
  WITH CHECK (is_trip_member(trip_id, auth.uid()) AND scanned_by = auth.uid());

-- ─── emergency_info ───────────────────────────────────────────────────────────
ALTER TABLE emergency_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can view emergency info"
  ON emergency_info FOR SELECT
  USING (is_trip_member(trip_id, auth.uid()));

CREATE POLICY "Trip members can add emergency info"
  ON emergency_info FOR INSERT
  WITH CHECK (is_trip_member(trip_id, auth.uid()) AND added_by = auth.uid());

CREATE POLICY "Info adders and organizers can update/delete"
  ON emergency_info FOR UPDATE
  USING (added_by = auth.uid() OR can_manage_trip(trip_id, auth.uid()));

CREATE POLICY "Info adders and organizers can delete"
  ON emergency_info FOR DELETE
  USING (added_by = auth.uid() OR can_manage_trip(trip_id, auth.uid()));

-- ─── announcements ────────────────────────────────────────────────────────────
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can view announcements"
  ON announcements FOR SELECT
  USING (is_trip_member(trip_id, auth.uid()));

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

-- ─── announcement_reads ───────────────────────────────────────────────────────
ALTER TABLE announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own reads"
  ON announcement_reads FOR ALL
  USING (user_id = auth.uid());

-- ─── notifications ────────────────────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Trip members can create notifications"
  ON notifications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM trip_members viewer
      JOIN trip_members recipient ON recipient.trip_id = viewer.trip_id
      WHERE viewer.user_id = auth.uid()
        AND recipient.user_id = notifications.user_id
        AND (notifications.trip_id IS NULL OR notifications.trip_id = viewer.trip_id)
    )
  );

-- ─── push_tokens ──────────────────────────────────────────────────────────────
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own push tokens"
  ON push_tokens FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Trip members can view recipient push tokens"
  ON push_tokens FOR SELECT
  USING (
    is_active = true AND
    EXISTS (
      SELECT 1
      FROM trip_members viewer
      JOIN trip_members recipient ON recipient.trip_id = viewer.trip_id
      WHERE viewer.user_id = auth.uid()
        AND recipient.user_id = push_tokens.user_id
    )
  );

-- ─── live_locations ───────────────────────────────────────────────────────────
ALTER TABLE live_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip members can view live locations"
  ON live_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trip_members
      WHERE trip_id = live_locations.trip_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can upsert their own location"
  ON live_locations FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM trip_members
      WHERE trip_id = live_locations.trip_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own location"
  ON live_locations FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own location"
  ON live_locations FOR DELETE
  USING (user_id = auth.uid());

-- ─── community_spots ─────────────────────────────────────────────────────────
ALTER TABLE community_spots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view community spots"
  ON community_spots FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can create their own community spots"
  ON community_spots FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own community spots"
  ON community_spots FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own community spots"
  ON community_spots FOR DELETE
  USING (user_id = auth.uid());

-- ─── community_spot_comments ─────────────────────────────────────────────────
ALTER TABLE community_spot_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view community spot comments"
  ON community_spot_comments FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can create their own community spot comments"
  ON community_spot_comments FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own community spot comments"
  ON community_spot_comments FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own community spot comments"
  ON community_spot_comments FOR DELETE
  USING (user_id = auth.uid());

-- ─── community_spot_votes ────────────────────────────────────────────────────
ALTER TABLE community_spot_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view community spot votes"
  ON community_spot_votes FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can manage their own community spot votes"
  ON community_spot_votes FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── Realtime enable ──────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
