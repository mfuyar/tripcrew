-- Notify the requester when a trip manager approves or rejects a join request.
-- This stays inside the SECURITY DEFINER review RPC so notification inserts do
-- not require loosening client-side notification RLS.

CREATE OR REPLACE FUNCTION public.review_trip_join_request(
  p_request_id UUID,
  p_reviewer_id UUID,
  p_status TEXT
)
RETURNS public.trip_join_requests AS $$
DECLARE
  req public.trip_join_requests;
  result public.trip_join_requests;
  trip_name TEXT;
BEGIN
  IF p_reviewer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot review as another user';
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid review status';
  END IF;

  SELECT *
  INTO req
  FROM public.trip_join_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF req.id IS NULL THEN
    RAISE EXCEPTION 'Join request not found';
  END IF;

  IF NOT public.can_manage_trip(req.trip_id, p_reviewer_id) THEN
    RAISE EXCEPTION 'Only trip organizers or admins can review join requests';
  END IF;

  UPDATE public.trip_join_requests
  SET status = p_status,
      reviewed_by = p_reviewer_id,
      reviewed_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO result;

  IF p_status = 'approved' THEN
    INSERT INTO public.trip_members (trip_id, user_id, role)
    VALUES (req.trip_id, req.user_id, 'member')
    ON CONFLICT (trip_id, user_id) DO NOTHING;
  END IF;

  BEGIN
    SELECT name INTO trip_name
    FROM public.trips
    WHERE id = req.trip_id;

    INSERT INTO public.notifications (user_id, trip_id, type, title, body, data, is_read)
    VALUES (
      req.user_id,
      req.trip_id,
      'other',
      CASE
        WHEN p_status = 'approved' THEN '✅ Join Request Approved'
        ELSE 'Join Request Update'
      END,
      CASE
        WHEN p_status = 'approved'
          THEN 'Your request to join "' || COALESCE(trip_name, 'this trip') || '" was approved.'
        ELSE 'Your request to join "' || COALESCE(trip_name, 'this trip') || '" was not approved.'
      END,
      jsonb_build_object(
        'trip_id', req.trip_id::text,
        'request_id', req.id::text,
        'status', p_status,
        'type', 'join_request_review'
      ),
      false
    );
  EXCEPTION WHEN OTHERS THEN
    -- Notification failure is non-fatal; the review result is already committed.
    NULL;
  END;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.review_trip_join_request(UUID, UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
