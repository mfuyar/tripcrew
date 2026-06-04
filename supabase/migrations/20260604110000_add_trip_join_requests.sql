-- Join codes now create privacy-safe access requests.
-- Organizers and trip admins must approve before a user becomes a trip member.

CREATE TABLE IF NOT EXISTS public.trip_join_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id       UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  UNIQUE (trip_id, user_id)
);

CREATE INDEX IF NOT EXISTS trip_join_requests_trip_status_idx
  ON public.trip_join_requests(trip_id, status, requested_at);
CREATE INDEX IF NOT EXISTS trip_join_requests_user_status_idx
  ON public.trip_join_requests(user_id, status, requested_at);

ALTER TABLE public.trip_join_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.request_trip_join_by_code(
  p_invite_code TEXT,
  p_user_id UUID
)
RETURNS public.trip_join_requests AS $$
DECLARE
  target_trip public.trips;
  result public.trip_join_requests;
BEGIN
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot request trip access for another user';
  END IF;

  SELECT *
  INTO target_trip
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
    status = CASE
      WHEN public.trip_join_requests.status = 'approved' THEN public.trip_join_requests.status
      ELSE 'pending'
    END,
    requested_at = CASE
      WHEN public.trip_join_requests.status = 'approved' THEN public.trip_join_requests.requested_at
      ELSE NOW()
    END,
    reviewed_by = CASE
      WHEN public.trip_join_requests.status = 'approved' THEN public.trip_join_requests.reviewed_by
      ELSE NULL
    END,
    reviewed_at = CASE
      WHEN public.trip_join_requests.status = 'approved' THEN public.trip_join_requests.reviewed_at
      ELSE NULL
    END
  RETURNING * INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.review_trip_join_request(
  p_request_id UUID,
  p_reviewer_id UUID,
  p_status TEXT
)
RETURNS public.trip_join_requests AS $$
DECLARE
  req public.trip_join_requests;
  result public.trip_join_requests;
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

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.request_trip_join_by_code(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_trip_join_request(UUID, UUID, TEXT) TO authenticated;

DROP POLICY IF EXISTS "Users can view their own join requests" ON public.trip_join_requests;
CREATE POLICY "Users can view their own join requests"
  ON public.trip_join_requests FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.can_manage_trip(trip_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can create their own join requests" ON public.trip_join_requests;
CREATE POLICY "Users can create their own join requests"
  ON public.trip_join_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Managers can update join requests" ON public.trip_join_requests;
CREATE POLICY "Managers can update join requests"
  ON public.trip_join_requests FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.can_manage_trip(trip_id, auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.can_manage_trip(trip_id, auth.uid())
  );
