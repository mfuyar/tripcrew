-- Create push-talk notification rows in the database so client-side RLS cannot
-- prevent trip recipients from being notified.

-- Return shape gained `auto_play`; CREATE OR REPLACE can't change a function's
-- return type, so drop the earlier version first (safe to re-run).
DROP FUNCTION IF EXISTS public.create_push_talk_notifications(UUID, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.create_push_talk_notifications(
  p_trip_id   UUID,
  p_sender_id UUID,
  p_family_id UUID DEFAULT NULL,
  p_media_url TEXT DEFAULT NULL
)
RETURNS TABLE(user_id UUID, auto_play BOOLEAN) AS $$
BEGIN
  IF p_sender_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot send push talk for another user';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.trip_members tm
    WHERE tm.trip_id = p_trip_id
      AND tm.user_id = p_sender_id
  ) THEN
    RAISE EXCEPTION 'Sender is not a member of this trip';
  END IF;

  RETURN QUERY
  WITH recipients AS (
    SELECT
      tm.user_id,
      COALESCE(BOOL_OR(fm.push_talk_enabled), false) AS push_talk_enabled
    FROM public.trip_members tm
    LEFT JOIN public.family_members fm
      ON fm.trip_id = tm.trip_id
     AND fm.user_id = tm.user_id
    WHERE tm.trip_id = p_trip_id
      AND tm.user_id <> p_sender_id
    GROUP BY tm.user_id
  ),
  inserted AS (
    INSERT INTO public.notifications (user_id, trip_id, type, title, body, data, is_read)
    SELECT
      r.user_id,
      p_trip_id,
      'push_talk',
      '🎙️ Push Talk',
      'A voice message was sent to your family',
      jsonb_build_object(
        'trip_id', p_trip_id::text,
        'family_id', p_family_id::text,
        'type', 'push_talk',
        'media_url', p_media_url,
        -- Each recipient's own Live Audio setting decides whether their device
        -- auto-plays this in the background; everyone still gets the alert.
        'auto_play', r.push_talk_enabled
      ),
      false
    FROM recipients r
    RETURNING notifications.user_id, (notifications.data->>'auto_play')::BOOLEAN AS auto_play
  )
  SELECT inserted.user_id, inserted.auto_play FROM inserted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.create_push_talk_notifications(UUID, UUID, UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
