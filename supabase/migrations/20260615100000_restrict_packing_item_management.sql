-- Packing list visibility is shared across trip members, but checklist
-- mutations belong to the person who added the item or the trip organizer.

DROP POLICY IF EXISTS "Trip members can manage packing items" ON public.packing_items;
DROP POLICY IF EXISTS "Trip members can view packing items" ON public.packing_items;
DROP POLICY IF EXISTS "Trip members can create their own packing items" ON public.packing_items;
DROP POLICY IF EXISTS "Creators and organizers can update packing items" ON public.packing_items;
DROP POLICY IF EXISTS "Creators and organizers can delete packing items" ON public.packing_items;

CREATE POLICY "Trip members can view packing items"
  ON public.packing_items FOR SELECT
  USING (public.is_trip_member(trip_id, auth.uid()));

CREATE POLICY "Trip members can create their own packing items"
  ON public.packing_items FOR INSERT
  WITH CHECK (
    public.is_trip_member(trip_id, auth.uid())
    AND added_by = auth.uid()
  );

CREATE POLICY "Creators and organizers can update packing items"
  ON public.packing_items FOR UPDATE
  USING (
    added_by = auth.uid()
    OR public.is_trip_organizer(trip_id, auth.uid())
    OR public.is_global_admin(auth.uid())
  )
  WITH CHECK (
    public.is_trip_member(trip_id, auth.uid())
    AND (
      added_by = auth.uid()
      OR public.is_trip_organizer(trip_id, auth.uid())
      OR public.is_global_admin(auth.uid())
    )
  );

CREATE POLICY "Creators and organizers can delete packing items"
  ON public.packing_items FOR DELETE
  USING (
    added_by = auth.uid()
    OR public.is_trip_organizer(trip_id, auth.uid())
    OR public.is_global_admin(auth.uid())
  );

NOTIFY pgrst, 'reload schema';
