-- Return pending join requests for trip managers with requester profile details.
-- This keeps the organizer UI independent from embedded profile RLS quirks.
CREATE OR REPLACE FUNCTION public.get_pending_join_requests_for_trip(
  p_trip_id UUID
)
RETURNS TABLE (
  id UUID,
  trip_id UUID,
  user_id UUID,
  status TEXT,
  requested_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  profile JSONB
) AS $$
BEGIN
  IF NOT public.can_manage_trip(p_trip_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only trip organizers or admins can view join requests';
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
    CASE
      WHEN p.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', p.id,
        'email', p.email,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'phone', p.phone,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      )
    END AS profile
  FROM public.trip_join_requests tjr
  LEFT JOIN public.profiles p ON p.id = tjr.user_id
  WHERE tjr.trip_id = p_trip_id
    AND tjr.status = 'pending'
  ORDER BY tjr.requested_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_pending_join_requests_for_trip(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
