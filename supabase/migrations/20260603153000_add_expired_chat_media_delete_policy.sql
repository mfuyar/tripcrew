-- Allow trip members to clean up ephemeral chat photos and audio after 24 hours.
DROP POLICY IF EXISTS "Trip members can delete expired chat media messages" ON public.messages;

CREATE POLICY "Trip members can delete expired chat media messages"
  ON public.messages FOR DELETE
  USING (
    public.is_trip_member(trip_id, auth.uid())
    AND message_type IN ('image', 'audio')
    AND media_url IS NOT NULL
    AND created_at < NOW() - INTERVAL '24 hours'
    AND (
      message_type = 'audio'
      OR media_url LIKE '%/trip-media/chat/%'
    )
  );
