-- Fix add_family_member_by_email:
-- 1. Allow trip_admin (not just trip_organizer) to call this function
-- 2. Use ON CONFLICT (trip_id, user_id) to match the actual unique index
-- 3. Move the member to the new family on conflict (not just update is_admin)
-- 4. Preserve both trip_organizer and trip_admin roles (not just trip_organizer)
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
  ON CONFLICT (trip_id, user_id) DO UPDATE
  SET
    family_id = EXCLUDED.family_id,
    is_admin = CASE
      WHEN public.family_members.family_id = EXCLUDED.family_id THEN public.family_members.is_admin OR EXCLUDED.is_admin
      ELSE EXCLUDED.is_admin
    END
  RETURNING * INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_family_member_by_email(UUID, UUID, TEXT, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
