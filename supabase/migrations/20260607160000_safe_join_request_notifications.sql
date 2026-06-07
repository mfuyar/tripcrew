-- Wrap the notification INSERT in an exception block so any failure
-- (missing profile, constraint violation, etc.) never rolls back
-- the join request itself.
CREATE OR REPLACE FUNCTION public.request_trip_join_by_code(
  p_invite_code TEXT,
  p_user_id UUID
)
RETURNS public.trip_join_requests AS $$
DECLARE
  target_trip    public.trips;
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

  INSERT INTO public.trip_join_requests (trip_id, user_id, status)
  VALUES (target_trip.id, p_user_id, 'pending')
  ON CONFLICT (trip_id, user_id) DO UPDATE
  SET
    status       = CASE WHEN trip_join_requests.status = 'approved' THEN trip_join_requests.status ELSE 'pending' END,
    requested_at = CASE WHEN trip_join_requests.status = 'approved' THEN trip_join_requests.requested_at ELSE NOW() END,
    reviewed_by  = CASE WHEN trip_join_requests.status = 'approved' THEN trip_join_requests.reviewed_by  ELSE NULL END,
    reviewed_at  = CASE WHEN trip_join_requests.status = 'approved' THEN trip_join_requests.reviewed_at  ELSE NULL END
  RETURNING * INTO result;

  -- Notify managers — wrapped in exception block so any failure
  -- does not roll back the join request above.
  BEGIN
    SELECT COALESCE(full_name, email, 'Someone') INTO requester_name
    FROM public.profiles WHERE id = p_user_id;

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
    -- Notification failure is non-fatal; join request is already committed above.
    NULL;
  END;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';
