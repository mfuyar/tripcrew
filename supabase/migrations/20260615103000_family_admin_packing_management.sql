-- Packing items can be managed by the creator, trip admins/organizers/global
-- admins, or a family admin when the item is assigned to their own family.

DROP POLICY IF EXISTS "Creators and organizers can update packing items" ON public.packing_items;
DROP POLICY IF EXISTS "Creators and organizers can delete packing items" ON public.packing_items;
DROP POLICY IF EXISTS "Creators family admins and trip admins can update packing items" ON public.packing_items;
DROP POLICY IF EXISTS "Creators family admins and trip admins can delete packing items" ON public.packing_items;

CREATE POLICY "Creators family admins and trip admins can update packing items"
  ON public.packing_items FOR UPDATE
  USING (
    added_by = auth.uid()
    OR public.can_manage_trip(trip_id, auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.trip_id = packing_items.trip_id
        AND fm.family_id = packing_items.assigned_family_id
        AND fm.user_id = auth.uid()
        AND fm.is_admin = true
    )
  )
  WITH CHECK (
    public.is_trip_member(trip_id, auth.uid())
    AND (
      added_by = auth.uid()
      OR public.can_manage_trip(trip_id, auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.family_members fm
        WHERE fm.trip_id = packing_items.trip_id
          AND fm.family_id = packing_items.assigned_family_id
          AND fm.user_id = auth.uid()
          AND fm.is_admin = true
      )
    )
  );

CREATE POLICY "Creators family admins and trip admins can delete packing items"
  ON public.packing_items FOR DELETE
  USING (
    added_by = auth.uid()
    OR public.can_manage_trip(trip_id, auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.trip_id = packing_items.trip_id
        AND fm.family_id = packing_items.assigned_family_id
        AND fm.user_id = auth.uid()
        AND fm.is_admin = true
    )
  );

NOTIFY pgrst, 'reload schema';
