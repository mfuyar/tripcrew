-- Packing items are soft-deleted and versioned so edits/deletes keep an audit
-- trail with who changed them and when.

ALTER TABLE public.packing_items
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_edited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.packing_item_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  packing_item_id UUID NOT NULL REFERENCES public.packing_items(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('create', 'update', 'delete', 'restore')),
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (packing_item_id, version_number)
);

CREATE INDEX IF NOT EXISTS packing_item_versions_item_id_idx
  ON public.packing_item_versions(packing_item_id);
CREATE INDEX IF NOT EXISTS packing_item_versions_trip_id_idx
  ON public.packing_item_versions(trip_id);

ALTER TABLE public.packing_item_versions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_packing_item(item public.packing_items, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    item.added_by = user_uuid
    OR public.can_manage_trip(item.trip_id, user_uuid)
    OR EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.trip_id = item.trip_id
        AND fm.family_id = item.assigned_family_id
        AND fm.user_id = user_uuid
        AND fm.is_admin = true
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_packing_item(public.packing_items, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.prepare_packing_item_audit()
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

CREATE OR REPLACE FUNCTION public.log_packing_item_version()
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
    INSERT INTO public.packing_item_versions (
      packing_item_id,
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
      to_jsonb(NEW),
      'create',
      auth.uid(),
      actor_name
    )
    ON CONFLICT (packing_item_id, version_number) DO NOTHING;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_deleted = false AND NEW.is_deleted = true THEN
      version_change_type := 'delete';
    ELSIF OLD.is_deleted = true AND NEW.is_deleted = false THEN
      version_change_type := 'restore';
    ELSE
      version_change_type := 'update';
    END IF;

    INSERT INTO public.packing_item_versions (
      packing_item_id,
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
      NEW.current_version,
      to_jsonb(NEW),
      version_change_type,
      auth.uid(),
      actor_name
    )
    ON CONFLICT (packing_item_id, version_number) DO NOTHING;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS prepare_packing_item_audit ON public.packing_items;
CREATE TRIGGER prepare_packing_item_audit
  BEFORE UPDATE ON public.packing_items
  FOR EACH ROW EXECUTE FUNCTION public.prepare_packing_item_audit();

DROP TRIGGER IF EXISTS log_packing_item_version_insert ON public.packing_items;
CREATE TRIGGER log_packing_item_version_insert
  AFTER INSERT ON public.packing_items
  FOR EACH ROW EXECUTE FUNCTION public.log_packing_item_version();

DROP TRIGGER IF EXISTS log_packing_item_version_update ON public.packing_items;
CREATE TRIGGER log_packing_item_version_update
  AFTER UPDATE ON public.packing_items
  FOR EACH ROW EXECUTE FUNCTION public.log_packing_item_version();

INSERT INTO public.packing_item_versions (
  packing_item_id,
  trip_id,
  version_number,
  snapshot,
  change_type,
  changed_by,
  changed_by_name,
  created_at
)
SELECT
  pi.id,
  pi.trip_id,
  1,
  to_jsonb(pi),
  'create',
  pi.added_by,
  COALESCE(p.full_name, p.email),
  pi.created_at
FROM public.packing_items pi
LEFT JOIN public.profiles p ON p.id = pi.added_by
ON CONFLICT (packing_item_id, version_number) DO NOTHING;

DROP POLICY IF EXISTS "Trip members can view packing items" ON public.packing_items;
CREATE POLICY "Trip members can view packing items"
  ON public.packing_items FOR SELECT
  USING (
    public.is_trip_member(trip_id, auth.uid())
    AND (
      is_deleted = false
      OR public.can_manage_packing_item(packing_items, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Creators family admins and trip admins can update packing items" ON public.packing_items;
CREATE POLICY "Creators family admins and trip admins can update packing items"
  ON public.packing_items FOR UPDATE
  USING (public.can_manage_packing_item(packing_items, auth.uid()))
  WITH CHECK (
    public.is_trip_member(trip_id, auth.uid())
    AND public.can_manage_packing_item(packing_items, auth.uid())
  );

DROP POLICY IF EXISTS "Creators family admins and trip admins can delete packing items" ON public.packing_items;
CREATE POLICY "Creators family admins and trip admins can delete packing items"
  ON public.packing_items FOR DELETE
  USING (public.can_manage_packing_item(packing_items, auth.uid()));

DROP POLICY IF EXISTS "Packing item managers can view versions" ON public.packing_item_versions;
CREATE POLICY "Packing item managers can view versions"
  ON public.packing_item_versions FOR SELECT
  USING (
    public.is_trip_member(trip_id, auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.packing_items pi
      WHERE pi.id = packing_item_versions.packing_item_id
        AND public.can_manage_packing_item(pi, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Packing audit trigger can insert versions" ON public.packing_item_versions;
CREATE POLICY "Packing audit trigger can insert versions"
  ON public.packing_item_versions FOR INSERT
  WITH CHECK (public.is_trip_member(trip_id, auth.uid()));

NOTIFY pgrst, 'reload schema';
