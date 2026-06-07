-- Families are created by trip organizers/admins only.
-- Regular trip members can join an existing family, but cannot create one.

DROP POLICY IF EXISTS "Trip members can create families" ON public.families;
DROP POLICY IF EXISTS "Trip admins can create families" ON public.families;
CREATE POLICY "Trip admins can create families"
  ON public.families FOR INSERT
  WITH CHECK (
    public.can_manage_trip(trip_id, auth.uid())
    AND created_by = auth.uid()
  );

NOTIFY pgrst, 'reload schema';
