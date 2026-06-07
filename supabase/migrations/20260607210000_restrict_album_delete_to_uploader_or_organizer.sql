-- Album photos can only be deleted by the uploader, trip organizer, or global admin.
-- Trip admins can still help manage the trip elsewhere, but cannot remove another
-- user's album media unless they are the organizer.

DROP POLICY IF EXISTS "Uploaders and organizers can delete media" ON public.trip_media;
CREATE POLICY "Uploaders and organizers can delete media"
  ON public.trip_media FOR DELETE
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.trip_members tm
      WHERE tm.trip_id = trip_media.trip_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'trip_organizer'
    )
    OR EXISTS (
      SELECT 1
      FROM public.global_admins ga
      WHERE ga.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
