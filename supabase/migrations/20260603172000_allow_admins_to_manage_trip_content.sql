-- Treat trip admins like organizers for content management across the app.
-- Whole-trip deletion and role-management UI remain organizer-only.

CREATE OR REPLACE FUNCTION public.can_manage_trip(trip_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT public.can_manage_announcements(trip_uuid, user_uuid);
$$ LANGUAGE sql SECURITY DEFINER;

DROP POLICY IF EXISTS "Organizers can update member roles" ON public.trip_members;
CREATE POLICY "Organizers can update member roles"
  ON public.trip_members FOR UPDATE
  USING (public.can_manage_trip(trip_id, auth.uid()));

DROP POLICY IF EXISTS "Family creators and organizers can update families" ON public.families;
CREATE POLICY "Family creators and organizers can update families"
  ON public.families FOR UPDATE
  USING (
    created_by = auth.uid()
    OR public.can_manage_trip(trip_id, auth.uid())
  );

DROP POLICY IF EXISTS "Family creators and organizers can delete families" ON public.families;
CREATE POLICY "Family creators and organizers can delete families"
  ON public.families FOR DELETE
  USING (
    created_by = auth.uid()
    OR public.can_manage_trip(trip_id, auth.uid())
  );

DROP POLICY IF EXISTS "Family admins and organizers can remove members" ON public.family_members;
CREATE POLICY "Family admins and organizers can remove members"
  ON public.family_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR public.can_manage_trip(trip_id, auth.uid())
  );

DROP POLICY IF EXISTS "Expense creators and organizers can update expenses" ON public.expenses;
CREATE POLICY "Expense creators and organizers can update expenses"
  ON public.expenses FOR UPDATE
  USING (
    paid_by_user_id = auth.uid()
    OR public.can_manage_trip(trip_id, auth.uid())
  );

DROP POLICY IF EXISTS "Expense creators and organizers can delete expenses" ON public.expenses;
CREATE POLICY "Expense creators and organizers can delete expenses"
  ON public.expenses FOR DELETE
  USING (
    paid_by_user_id = auth.uid()
    OR public.can_manage_trip(trip_id, auth.uid())
  );

DROP POLICY IF EXISTS "Settlement payer or receiver can update status" ON public.settlements;
CREATE POLICY "Settlement payer or receiver can update status"
  ON public.settlements FOR UPDATE
  USING (
    public.is_trip_member(trip_id, auth.uid())
    AND (
      (status IN ('pending', 'disputed') AND EXISTS (
        SELECT 1 FROM public.family_members
        WHERE family_members.family_id = settlements.from_family_id
          AND family_members.user_id = auth.uid()
      ))
      OR (status = 'paid' AND EXISTS (
        SELECT 1 FROM public.family_members
        WHERE family_members.family_id = settlements.to_family_id
          AND family_members.user_id = auth.uid()
      ))
      OR public.can_manage_trip(trip_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Uploaders and organizers can delete media" ON public.trip_media;
CREATE POLICY "Uploaders and organizers can delete media"
  ON public.trip_media FOR DELETE
  USING (
    uploaded_by = auth.uid()
    OR public.can_manage_trip(trip_id, auth.uid())
  );

DROP POLICY IF EXISTS "Uploaders can update captions" ON public.trip_media;
CREATE POLICY "Uploaders can update captions"
  ON public.trip_media FOR UPDATE
  USING (
    uploaded_by = auth.uid()
    OR public.can_manage_trip(trip_id, auth.uid())
  );

DROP POLICY IF EXISTS "Creators and organizers can update items" ON public.itinerary_items;
CREATE POLICY "Creators and organizers can update items"
  ON public.itinerary_items FOR UPDATE
  USING (created_by = auth.uid() OR public.can_manage_trip(trip_id, auth.uid()));

DROP POLICY IF EXISTS "Creators and organizers can delete items" ON public.itinerary_items;
CREATE POLICY "Creators and organizers can delete items"
  ON public.itinerary_items FOR DELETE
  USING (created_by = auth.uid() OR public.can_manage_trip(trip_id, auth.uid()));

DROP POLICY IF EXISTS "Car creators and organizers can manage cars" ON public.cars;
CREATE POLICY "Car creators and organizers can manage cars"
  ON public.cars FOR UPDATE
  USING (created_by = auth.uid() OR public.can_manage_trip(trip_id, auth.uid()));

DROP POLICY IF EXISTS "Car creators and organizers can delete cars" ON public.cars;
CREATE POLICY "Car creators and organizers can delete cars"
  ON public.cars FOR DELETE
  USING (created_by = auth.uid() OR public.can_manage_trip(trip_id, auth.uid()));

DROP POLICY IF EXISTS "Info adders and organizers can update/delete" ON public.emergency_info;
CREATE POLICY "Info adders and organizers can update/delete"
  ON public.emergency_info FOR UPDATE
  USING (added_by = auth.uid() OR public.can_manage_trip(trip_id, auth.uid()));

DROP POLICY IF EXISTS "Info adders and organizers can delete" ON public.emergency_info;
CREATE POLICY "Info adders and organizers can delete"
  ON public.emergency_info FOR DELETE
  USING (added_by = auth.uid() OR public.can_manage_trip(trip_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.add_family_member_by_email(
  family_uuid UUID,
  trip_uuid UUID,
  member_email TEXT,
  make_admin BOOLEAN DEFAULT false
)
RETURNS public.family_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id UUID;
  result public.family_members;
BEGIN
  IF NOT public.can_manage_trip(trip_uuid, auth.uid()) THEN
    RAISE EXCEPTION 'Only trip organizers or admins can add members by email';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.families
    WHERE id = family_uuid AND trip_id = trip_uuid
  ) THEN
    RAISE EXCEPTION 'Family not found';
  END IF;

  SELECT id INTO target_user_id
  FROM public.profiles
  WHERE lower(email) = lower(trim(member_email))
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No TripCrew account found for this email. Send an invite email instead.';
  END IF;

  INSERT INTO public.trip_members (trip_id, user_id, family_id, role)
  VALUES (trip_uuid, target_user_id, family_uuid, CASE WHEN make_admin THEN 'family_admin' ELSE 'member' END)
  ON CONFLICT (trip_id, user_id) DO UPDATE
  SET
    family_id = EXCLUDED.family_id,
    role = CASE
      WHEN public.trip_members.role IN ('trip_organizer', 'trip_admin') THEN public.trip_members.role
      ELSE EXCLUDED.role
    END;

  INSERT INTO public.family_members (family_id, trip_id, user_id, is_admin, push_talk_enabled)
  VALUES (family_uuid, trip_uuid, target_user_id, make_admin, false)
  ON CONFLICT (family_id, user_id) DO UPDATE
  SET is_admin = public.family_members.is_admin OR EXCLUDED.is_admin
  RETURNING * INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_family_member_by_email(UUID, UUID, TEXT, BOOLEAN) TO authenticated;
