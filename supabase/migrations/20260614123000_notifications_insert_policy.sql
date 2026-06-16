-- Notification rows are created by app clients for trip-scoped events before
-- the Edge Function sends the remote push. RLS was enabled with SELECT/UPDATE
-- policies but no INSERT policy in one deployed migration path, which caused
-- notifyUsers() flows to fail before push delivery.

DROP POLICY IF EXISTS "Trip members can create notifications" ON public.notifications;
CREATE POLICY "Trip members can create notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.trip_members viewer
      JOIN public.trip_members recipient ON recipient.trip_id = viewer.trip_id
      WHERE viewer.user_id = auth.uid()
        AND recipient.user_id = notifications.user_id
        AND (
          notifications.trip_id IS NULL
          OR notifications.trip_id = viewer.trip_id
        )
    )
  );

NOTIFY pgrst, 'reload schema';
