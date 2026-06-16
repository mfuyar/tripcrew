-- Poll creators can edit choices, but only trip organizers/global admins can
-- soft-delete a poll even if a client tries to update is_deleted directly.

CREATE OR REPLACE FUNCTION public.prepare_poll_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_deleted = false
      AND NEW.is_deleted = true
      AND NOT public.can_delete_poll(OLD, auth.uid())
    THEN
      RAISE EXCEPTION 'Only the trip organizer can delete this poll';
    END IF;

    NEW.current_version := COALESCE(OLD.current_version, 1) + 1;
    NEW.last_edited_by := auth.uid();
    NEW.last_edited_at := NOW();

    IF OLD.is_deleted = false AND NEW.is_deleted = true THEN
      NEW.deleted_at := COALESCE(NEW.deleted_at, NOW());
      NEW.deleted_by := COALESCE(NEW.deleted_by, auth.uid());
    ELSIF OLD.is_deleted = true AND NEW.is_deleted = false THEN
      NEW.deleted_at := NULL;
      NEW.deleted_by := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_poll_with_options(
  p_poll_id UUID,
  p_question TEXT,
  p_description TEXT,
  p_allow_multiple BOOLEAN,
  p_options JSONB
)
RETURNS public.polls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  poll_row public.polls;
  option_row JSONB;
  draft_option_id UUID;
  saved_option_id UUID;
  next_option_text TEXT;
  kept_option_ids UUID[] := ARRAY[]::UUID[];
  result public.polls;
BEGIN
  SELECT * INTO poll_row
  FROM public.polls
  WHERE id = p_poll_id
  FOR UPDATE;

  IF poll_row.id IS NULL OR poll_row.is_deleted = true THEN
    RAISE EXCEPTION 'Poll not found';
  END IF;

  IF NOT public.can_edit_poll(poll_row, auth.uid()) THEN
    RAISE EXCEPTION 'Only the poll creator or trip admins can edit this poll';
  END IF;

  IF jsonb_typeof(p_options) <> 'array' OR jsonb_array_length(p_options) < 2 THEN
    RAISE EXCEPTION 'Poll needs at least two choices';
  END IF;

  FOR option_row IN SELECT * FROM jsonb_array_elements(p_options)
  LOOP
    draft_option_id := NULLIF(option_row->>'id', '')::UUID;
    saved_option_id := NULL;
    next_option_text := trim(option_row->>'option_text');

    IF next_option_text = '' THEN
      RAISE EXCEPTION 'Poll choices cannot be blank';
    END IF;

    IF draft_option_id IS NOT NULL THEN
      UPDATE public.poll_options
      SET
        option_text = next_option_text,
        is_deleted = false,
        deleted_at = NULL,
        deleted_by = NULL,
        updated_at = NOW()
      WHERE id = draft_option_id
        AND poll_id = p_poll_id
      RETURNING id INTO saved_option_id;

      IF saved_option_id IS NULL THEN
        RAISE EXCEPTION 'Poll choice not found';
      END IF;
    ELSE
      INSERT INTO public.poll_options (poll_id, trip_id, option_text, votes_count)
      VALUES (p_poll_id, poll_row.trip_id, next_option_text, 0)
      RETURNING id INTO saved_option_id;
    END IF;

    kept_option_ids := array_append(kept_option_ids, saved_option_id);
  END LOOP;

  UPDATE public.poll_options
  SET
    is_deleted = true,
    deleted_at = NOW(),
    deleted_by = auth.uid(),
    updated_at = NOW()
  WHERE poll_id = p_poll_id
    AND is_deleted = false
    AND NOT (id = ANY(kept_option_ids));

  UPDATE public.polls
  SET
    question = trim(p_question),
    description = NULLIF(trim(COALESCE(p_description, '')), ''),
    allow_multiple = COALESCE(p_allow_multiple, false),
    updated_at = NOW()
  WHERE id = p_poll_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

NOTIFY pgrst, 'reload schema';
