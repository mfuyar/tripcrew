-- Allow users who have a join request to see the trip they requested.
-- Without this policy the trip name/details are NULL in getMyJoinRequests()
-- because the existing SELECT policy only allows trip members.

DROP POLICY IF EXISTS "Requesters can view requested trip info" ON public.trips;
CREATE POLICY "Requesters can view requested trip info"
  ON public.trips FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_join_requests
      WHERE trip_id = trips.id
        AND user_id = auth.uid()
        AND status IN ('pending', 'approved', 'rejected')
    )
  );
