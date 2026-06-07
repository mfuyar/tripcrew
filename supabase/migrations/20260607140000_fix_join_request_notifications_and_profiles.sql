-- Fix 1: Allow trip managers to see profiles of people who have pending join requests.
-- Without this, getPendingJoinRequests returns profile=null (profiles RLS blocks non-members).
DROP POLICY IF EXISTS "Managers can view profiles of join requesters" ON public.profiles;
CREATE POLICY "Managers can view profiles of join requesters"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_join_requests tjr
      WHERE tjr.user_id = profiles.id
        AND tjr.status = 'pending'
        AND public.can_manage_trip(tjr.trip_id, auth.uid())
    )
  );

-- Fix 2: Move notification logic into the SECURITY DEFINER function.
-- App-side code queries trip_members as the requester, who is not a member yet —
-- the trip_members RLS blocks it, so managerIds is always empty and no notifications
-- are ever sent. Running inside SECURITY DEFINER bypasses RLS.
CREATE OR REPLACE FUNCTION public.request_trip_join_by_code(
  p_invite_code TEXT,
  p_user_id UUID
)
RETURNS public.trip_join_requests AS $$
DECLARE
  target_trip  public.trips;
  result       public.trip_join_requests;
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

  -- Notify all managers of this trip (SECURITY DEFINER bypasses trip_members RLS)
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

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';
