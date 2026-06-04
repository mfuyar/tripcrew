WITH ranked_members AS (
  SELECT
    fm.id,
    ROW_NUMBER() OVER (
      PARTITION BY fm.trip_id, fm.user_id
      ORDER BY
        CASE
          WHEN fm.family_id = (
            SELECT tm.family_id
            FROM public.trip_members tm
            WHERE tm.trip_id = fm.trip_id
              AND tm.user_id = fm.user_id
            LIMIT 1
          ) THEN 0
          ELSE 1
        END,
        fm.is_admin DESC,
        fm.created_at DESC,
        fm.id DESC
    ) AS row_number
  FROM public.family_members fm
)
DELETE FROM public.family_members fm
USING ranked_members ranked
WHERE fm.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS family_members_trip_id_user_id_key
  ON public.family_members(trip_id, user_id);

CREATE OR REPLACE FUNCTION public.switch_family_membership(
  family_uuid UUID,
  trip_uuid UUID,
  member_uuid UUID DEFAULT auth.uid(),
  make_admin BOOLEAN DEFAULT false
)
RETURNS public.family_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.family_members;
BEGIN
  IF member_uuid IS NULL THEN
    RAISE EXCEPTION 'Member is required';
  END IF;

  IF member_uuid <> auth.uid() AND NOT public.can_manage_trip(trip_uuid, auth.uid()) THEN
    RAISE EXCEPTION 'Only trip organizers or admins can move another member';
  END IF;

  IF NOT public.is_trip_member(trip_uuid, member_uuid) THEN
    RAISE EXCEPTION 'Member is not part of this trip';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.families
    WHERE id = family_uuid
      AND trip_id = trip_uuid
  ) THEN
    RAISE EXCEPTION 'Family not found';
  END IF;

  INSERT INTO public.family_members (family_id, trip_id, user_id, is_admin, push_talk_enabled)
  VALUES (family_uuid, trip_uuid, member_uuid, make_admin, false)
  ON CONFLICT (trip_id, user_id) DO UPDATE
  SET
    family_id = EXCLUDED.family_id,
    is_admin = CASE
      WHEN public.family_members.family_id = EXCLUDED.family_id THEN public.family_members.is_admin OR EXCLUDED.is_admin
      ELSE EXCLUDED.is_admin
    END
  RETURNING * INTO result;

  UPDATE public.trip_members
  SET family_id = family_uuid
  WHERE trip_id = trip_uuid
    AND user_id = member_uuid;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_family_membership(UUID, UUID, UUID, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
