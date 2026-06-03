ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

DROP POLICY IF EXISTS "Users can edit their own text messages" ON public.messages;

CREATE POLICY "Users can edit their own text messages"
  ON public.messages FOR UPDATE
  USING (
    public.is_trip_member(trip_id, auth.uid())
    AND user_id = auth.uid()
    AND message_type = 'text'
  )
  WITH CHECK (
    public.is_trip_member(trip_id, auth.uid())
    AND user_id = auth.uid()
    AND message_type = 'text'
  );
