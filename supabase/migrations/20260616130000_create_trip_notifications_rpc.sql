-- create_trip_notifications: SECURITY DEFINER function that inserts notifications
-- for all trip members except the sender, bypassing RLS.
-- Mirrors the pattern used by create_push_talk_notifications.
CREATE OR REPLACE FUNCTION public.create_trip_notifications(
  p_trip_id   uuid,
  p_sender_id uuid,
  p_type      text,
  p_title     text,
  p_body      text,
  p_data      jsonb DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Only the authenticated user may send as themselves
  IF p_sender_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot create notifications for another user';
  END IF;

  -- Verify sender is actually a trip member
  IF NOT EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = p_trip_id AND user_id = p_sender_id
  ) THEN
    RAISE EXCEPTION 'Sender is not a member of this trip';
  END IF;

  -- Validate type against allowed values
  IF p_type NOT IN (
    'expense_added', 'settlement_request', 'payment_confirmed',
    'message', 'announcement', 'poll', 'push_talk', 'other'
  ) THEN
    RAISE EXCEPTION 'Invalid notification type: %', p_type;
  END IF;

  INSERT INTO public.notifications (user_id, trip_id, type, title, body, data, is_read)
  SELECT
    tm.user_id,
    p_trip_id,
    p_type,
    p_title,
    p_body,
    p_data,
    false
  FROM public.trip_members tm
  WHERE tm.trip_id = p_trip_id
    AND tm.user_id <> p_sender_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
