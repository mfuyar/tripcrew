-- Allow trip creation to return the inserted row after invite-code lookup was
-- locked down. The creator is not a trip_member until the next insert, so the
-- normal member SELECT policy does not cover INSERT ... RETURNING.

DROP POLICY IF EXISTS "Trip creators can view created trips" ON public.trips;
CREATE POLICY "Trip creators can view created trips"
  ON public.trips FOR SELECT
  USING (
    is_held = false
    AND created_by = auth.uid()
  );

NOTIFY pgrst, 'reload schema';
