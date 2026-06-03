CREATE OR REPLACE FUNCTION public.recalculate_poll_vote_counts(target_poll_id UUID)
RETURNS void AS $$
  UPDATE public.poll_options po
  SET votes_count = (
    SELECT COUNT(*)::INTEGER
    FROM public.poll_votes pv
    WHERE pv.poll_option_id = po.id
  )
  WHERE po.poll_id = target_poll_id;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.cast_poll_vote(
  p_poll_id UUID,
  p_option_id UUID,
  p_trip_id UUID,
  p_user_id UUID,
  p_family_id UUID DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  multiple_allowed BOOLEAN;
  poll_status TEXT;
  existing_vote RECORD;
BEGIN
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot vote for another user';
  END IF;

  IF NOT public.is_trip_member(p_trip_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not a trip member';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_poll_id::text || ':' || p_user_id::text, 0));

  SELECT allow_multiple, status INTO multiple_allowed, poll_status
  FROM public.polls
  WHERE id = p_poll_id AND trip_id = p_trip_id;

  IF poll_status IS NULL THEN
    RAISE EXCEPTION 'Poll not found';
  END IF;

  IF poll_status <> 'active' THEN
    RAISE EXCEPTION 'Poll is closed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.poll_options
    WHERE id = p_option_id
      AND poll_id = p_poll_id
      AND trip_id = p_trip_id
  ) THEN
    RAISE EXCEPTION 'Poll option does not belong to this poll';
  END IF;

  IF multiple_allowed IS TRUE THEN
    SELECT id INTO existing_vote
    FROM public.poll_votes
    WHERE poll_id = p_poll_id
      AND poll_option_id = p_option_id
      AND user_id = p_user_id
    LIMIT 1;

    IF FOUND THEN
      DELETE FROM public.poll_votes WHERE id = existing_vote.id;
    ELSE
      INSERT INTO public.poll_votes (poll_id, poll_option_id, trip_id, user_id, family_id)
      VALUES (p_poll_id, p_option_id, p_trip_id, p_user_id, p_family_id)
      ON CONFLICT (poll_id, poll_option_id, user_id) DO NOTHING;
    END IF;
  ELSE
    SELECT id, poll_option_id INTO existing_vote
    FROM public.poll_votes
    WHERE poll_id = p_poll_id
      AND user_id = p_user_id
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO public.poll_votes (poll_id, poll_option_id, trip_id, user_id, family_id)
      VALUES (p_poll_id, p_option_id, p_trip_id, p_user_id, p_family_id);
    ELSIF existing_vote.poll_option_id <> p_option_id THEN
      UPDATE public.poll_votes
      SET poll_option_id = p_option_id,
          family_id = p_family_id
      WHERE id = existing_vote.id;
    END IF;
  END IF;

  PERFORM public.recalculate_poll_vote_counts(p_poll_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP POLICY IF EXISTS "Poll creators and organizers can update polls" ON public.polls;
CREATE POLICY "Poll creators and organizers can update polls"
  ON public.polls FOR UPDATE
  USING (created_by = auth.uid() OR public.can_manage_announcements(trip_id, auth.uid()));

DROP POLICY IF EXISTS "Admins can delete polls" ON public.polls;
CREATE POLICY "Admins can delete polls"
  ON public.polls FOR DELETE
  USING (public.can_manage_announcements(trip_id, auth.uid()));

DO $$
DECLARE
  poll_row RECORD;
BEGIN
  FOR poll_row IN SELECT id FROM public.polls LOOP
    PERFORM public.recalculate_poll_vote_counts(poll_row.id);
  END LOOP;
END $$;
