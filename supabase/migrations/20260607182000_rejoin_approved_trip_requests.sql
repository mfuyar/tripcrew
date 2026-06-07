-- Repair users who left a trip after their join request had already been approved,
-- then requested access again. The old approved request should restore membership
-- instead of sitting invisible to both requester and organizers.

INSERT INTO public.trip_members (trip_id, user_id, role)
SELECT tjr.trip_id, tjr.user_id, 'member'
FROM public.trip_join_requests tjr
WHERE tjr.status = 'approved'
  AND NOT EXISTS (
    SELECT 1
    FROM public.trip_members tm
    WHERE tm.trip_id = tjr.trip_id
      AND tm.user_id = tjr.user_id
  )
ON CONFLICT (trip_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.request_trip_join_by_code(
  p_invite_code TEXT,
  p_user_id UUID
)
RETURNS public.trip_join_requests AS $$
DECLARE
  target_trip    public.trips;
  existing_req   public.trip_join_requests;
  result         public.trip_join_requests;
  requester_name TEXT;
BEGIN
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot request trip access for another user';
  END IF;

  SELECT * INTO target_trip
  FROM public.trips
  WHERE invite_code = upper(trim(p_invite_code))
    AND is_active = true
  LIMIT 1;

  IF target_trip.id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = target_trip.id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'You are already a member of this trip';
  END IF;

  SELECT * INTO existing_req
  FROM public.trip_join_requests
  WHERE trip_id = target_trip.id
    AND user_id = p_user_id
  FOR UPDATE;

  IF existing_req.id IS NOT NULL THEN
    IF existing_req.status = 'approved' THEN
      INSERT INTO public.trip_members (trip_id, user_id, role)
      VALUES (target_trip.id, p_user_id, 'member')
      ON CONFLICT (trip_id, user_id) DO NOTHING;

      RETURN existing_req;
    END IF;

    IF existing_req.status = 'pending' THEN
      RETURN existing_req;
    END IF;

    UPDATE public.trip_join_requests
    SET status = 'pending',
        requested_at = NOW(),
        reviewed_by = NULL,
        reviewed_at = NULL
    WHERE id = existing_req.id
    RETURNING * INTO result;
  ELSE
    INSERT INTO public.trip_join_requests (trip_id, user_id, status)
    VALUES (target_trip.id, p_user_id, 'pending')
    RETURNING * INTO result;
  END IF;

  BEGIN
    SELECT COALESCE(full_name, email, 'Someone') INTO requester_name
    FROM public.profiles
    WHERE id = p_user_id;

    INSERT INTO public.notifications (user_id, trip_id, type, title, body, data, is_read)
    SELECT
      tm.user_id,
      target_trip.id,
      'other',
      '🙋 New Join Request',
      requester_name || ' wants to join "' || target_trip.name || '". Open Trip Settings to review.',
      jsonb_build_object('trip_id', target_trip.id::text, 'request_id', result.id::text),
      false
    FROM public.trip_members tm
    WHERE tm.trip_id = target_trip.id
      AND tm.role IN ('trip_organizer', 'trip_admin');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.request_trip_join_by_code(TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
