-- Return the current user's join requests with basic trip details.
-- This keeps the requester-side My Trips UI independent from embedded trip RLS.
CREATE OR REPLACE FUNCTION public.get_my_join_requests(
  p_user_id UUID
)
RETURNS TABLE (
  id UUID,
  trip_id UUID,
  user_id UUID,
  status TEXT,
  requested_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  trip JSONB
) AS $$
BEGIN
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot view join requests for another user';
  END IF;

  RETURN QUERY
  SELECT
    tjr.id,
    tjr.trip_id,
    tjr.user_id,
    tjr.status,
    tjr.requested_at,
    tjr.reviewed_by,
    tjr.reviewed_at,
    jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'destination', t.destination,
      'start_date', t.start_date,
      'end_date', t.end_date,
      'currency', t.currency,
      'status', t.status
    ) AS trip
  FROM public.trip_join_requests tjr
  JOIN public.trips t ON t.id = tjr.trip_id
  WHERE tjr.user_id = p_user_id
    AND tjr.status IN ('pending', 'approved', 'rejected')
  ORDER BY tjr.requested_at DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_my_join_requests(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
