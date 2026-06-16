-- Poll edits are versioned. Poll creators can edit poll choices, while poll
-- deletion is a soft delete limited to the trip organizer or global admin.

ALTER TABLE public.polls
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_edited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;

ALTER TABLE public.poll_options
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.poll_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('create', 'update', 'delete', 'restore', 'close')),
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poll_id, version_number)
);

CREATE INDEX IF NOT EXISTS poll_versions_poll_id_idx ON public.poll_versions(poll_id);
CREATE INDEX IF NOT EXISTS poll_versions_trip_id_idx ON public.poll_versions(trip_id);

ALTER TABLE public.poll_versions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_edit_poll(poll_row public.polls, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    poll_row.created_by = user_uuid
    OR public.can_manage_trip(poll_row.trip_id, user_uuid)
    OR public.is_global_admin(user_uuid);
$$;

CREATE OR REPLACE FUNCTION public.can_delete_poll(poll_row public.polls, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_trip_organizer(poll_row.trip_id, user_uuid)
    OR public.is_global_admin(user_uuid);
$$;

GRANT EXECUTE ON FUNCTION public.can_edit_poll(public.polls, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_poll(public.polls, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.poll_snapshot(poll_row public.polls)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(poll_row) || jsonb_build_object(
    'options',
    COALESCE((
      SELECT jsonb_agg(to_jsonb(po) ORDER BY po.created_at)
      FROM public.poll_options po
      WHERE po.poll_id = poll_row.id
        AND po.is_deleted = false
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.prepare_poll_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
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

CREATE OR REPLACE FUNCTION public.log_poll_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name TEXT;
  version_change_type TEXT;
BEGIN
  SELECT COALESCE(full_name, email)
    INTO actor_name
    FROM public.profiles
    WHERE id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    version_change_type := 'create';
  ELSIF OLD.is_deleted = false AND NEW.is_deleted = true THEN
    version_change_type := 'delete';
  ELSIF OLD.is_deleted = true AND NEW.is_deleted = false THEN
    version_change_type := 'restore';
  ELSIF OLD.status <> 'closed' AND NEW.status = 'closed' THEN
    version_change_type := 'close';
  ELSE
    version_change_type := 'update';
  END IF;

  INSERT INTO public.poll_versions (
    poll_id,
    trip_id,
    version_number,
    snapshot,
    change_type,
    changed_by,
    changed_by_name
  )
  VALUES (
    NEW.id,
    NEW.trip_id,
    COALESCE(NEW.current_version, 1),
    public.poll_snapshot(NEW),
    version_change_type,
    auth.uid(),
    actor_name
  )
  ON CONFLICT (poll_id, version_number) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prepare_poll_audit ON public.polls;
CREATE TRIGGER prepare_poll_audit
  BEFORE UPDATE ON public.polls
  FOR EACH ROW EXECUTE FUNCTION public.prepare_poll_audit();

DROP TRIGGER IF EXISTS log_poll_version_insert ON public.polls;
CREATE TRIGGER log_poll_version_insert
  AFTER INSERT ON public.polls
  FOR EACH ROW EXECUTE FUNCTION public.log_poll_version();

DROP TRIGGER IF EXISTS log_poll_version_update ON public.polls;
CREATE TRIGGER log_poll_version_update
  AFTER UPDATE ON public.polls
  FOR EACH ROW EXECUTE FUNCTION public.log_poll_version();

INSERT INTO public.poll_versions (
  poll_id,
  trip_id,
  version_number,
  snapshot,
  change_type,
  changed_by,
  changed_by_name,
  created_at
)
SELECT
  p.id,
  p.trip_id,
  1,
  public.poll_snapshot(p),
  'create',
  p.created_by,
  COALESCE(pr.full_name, pr.email),
  p.created_at
FROM public.polls p
LEFT JOIN public.profiles pr ON pr.id = p.created_by
ON CONFLICT (poll_id, version_number) DO NOTHING;

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
  option_id UUID;
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
    option_id := NULLIF(option_row->>'id', '')::UUID;
    next_option_text := trim(option_row->>'option_text');

    IF next_option_text = '' THEN
      RAISE EXCEPTION 'Poll choices cannot be blank';
    END IF;

    IF option_id IS NOT NULL THEN
      UPDATE public.poll_options
      SET
        option_text = next_option_text,
        is_deleted = false,
        deleted_at = NULL,
        deleted_by = NULL,
        updated_at = NOW()
      WHERE id = option_id
        AND poll_id = p_poll_id
      RETURNING id INTO option_id;

      IF option_id IS NULL THEN
        RAISE EXCEPTION 'Poll choice not found';
      END IF;
    ELSE
      INSERT INTO public.poll_options (poll_id, trip_id, option_text, votes_count)
      VALUES (p_poll_id, poll_row.trip_id, next_option_text, 0)
      RETURNING id INTO option_id;
    END IF;

    kept_option_ids := array_append(kept_option_ids, option_id);
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

GRANT EXECUTE ON FUNCTION public.update_poll_with_options(UUID, TEXT, TEXT, BOOLEAN, JSONB) TO authenticated;

DROP POLICY IF EXISTS "Trip members can view polls" ON public.polls;
CREATE POLICY "Trip members can view polls"
  ON public.polls FOR SELECT
  USING (
    public.is_trip_member(trip_id, auth.uid())
    AND (
      is_deleted = false
      OR public.can_delete_poll(polls, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Poll creators and organizers can update polls" ON public.polls;
DROP POLICY IF EXISTS "Poll creators and trip admins can update polls" ON public.polls;
CREATE POLICY "Poll creators and trip admins can update polls"
  ON public.polls FOR UPDATE
  USING (public.can_edit_poll(polls, auth.uid()))
  WITH CHECK (
    public.is_trip_member(trip_id, auth.uid())
    AND public.can_edit_poll(polls, auth.uid())
  );

DROP POLICY IF EXISTS "Admins can delete polls" ON public.polls;
DROP POLICY IF EXISTS "Trip members can view and manage poll options" ON public.poll_options;

CREATE POLICY "Trip members can view poll options"
  ON public.poll_options FOR SELECT
  USING (
    public.is_trip_member(trip_id, auth.uid())
    AND (
      is_deleted = false
      OR EXISTS (
        SELECT 1
        FROM public.polls p
        WHERE p.id = poll_options.poll_id
          AND public.can_edit_poll(p, auth.uid())
      )
    )
  );

CREATE POLICY "Poll editors can create poll options"
  ON public.poll_options FOR INSERT
  WITH CHECK (
    public.is_trip_member(trip_id, auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.polls p
      WHERE p.id = poll_options.poll_id
        AND p.trip_id = poll_options.trip_id
        AND public.can_edit_poll(p, auth.uid())
    )
  );

CREATE POLICY "Poll editors can update poll options"
  ON public.poll_options FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.polls p
      WHERE p.id = poll_options.poll_id
        AND public.can_edit_poll(p, auth.uid())
    )
  )
  WITH CHECK (
    public.is_trip_member(trip_id, auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.polls p
      WHERE p.id = poll_options.poll_id
        AND public.can_edit_poll(p, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Poll managers can view versions" ON public.poll_versions;
CREATE POLICY "Poll managers can view versions"
  ON public.poll_versions FOR SELECT
  USING (
    public.is_trip_member(trip_id, auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.polls p
      WHERE p.id = poll_versions.poll_id
        AND public.can_edit_poll(p, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Poll audit trigger can insert versions" ON public.poll_versions;
CREATE POLICY "Poll audit trigger can insert versions"
  ON public.poll_versions FOR INSERT
  WITH CHECK (public.is_trip_member(trip_id, auth.uid()));

NOTIFY pgrst, 'reload schema';
