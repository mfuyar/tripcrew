-- ─── Expense versioning + soft delete ────────────────────────────────────────

-- 1. New columns on expenses
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS is_deleted       BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_version  INTEGER     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_edited_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_edited_at   TIMESTAMPTZ;

-- 2. expense_versions table — one row per snapshot
CREATE TABLE IF NOT EXISTS public.expense_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id       UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  trip_id          UUID NOT NULL REFERENCES public.trips(id)    ON DELETE CASCADE,
  version_number   INTEGER NOT NULL,
  snapshot         JSONB NOT NULL,          -- full expense fields at this point in time
  change_type      TEXT NOT NULL            -- 'create' | 'update' | 'delete' | 'restore'
                     CHECK (change_type IN ('create','update','delete','restore')),
  change_summary   TEXT,                    -- human-readable diff, e.g. "Amount: $50 → $75"
  changed_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_name  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (expense_id, version_number)
);

CREATE INDEX IF NOT EXISTS expense_versions_expense_id_idx ON public.expense_versions(expense_id);
CREATE INDEX IF NOT EXISTS expense_versions_trip_id_idx    ON public.expense_versions(trip_id);

-- 3. RLS
ALTER TABLE public.expense_versions ENABLE ROW LEVEL SECURITY;

-- Trip admins/organizers see all versions; regular members only see the current version
CREATE POLICY "Admins can view all versions"
  ON public.expense_versions FOR SELECT
  USING (
    can_manage_trip(trip_id, auth.uid())
    OR (
      is_trip_member(trip_id, auth.uid())
      AND version_number = (
        SELECT current_version FROM public.expenses WHERE id = expense_id
      )
    )
  );

CREATE POLICY "Authenticated members can insert versions"
  ON public.expense_versions FOR INSERT
  WITH CHECK (is_trip_member(trip_id, auth.uid()));

-- Admins/organizers can delete old versions (purge)
CREATE POLICY "Admins can delete versions"
  ON public.expense_versions FOR DELETE
  USING (can_manage_trip(trip_id, auth.uid()));

-- 4. Filter soft-deleted expenses from normal member queries
DROP POLICY IF EXISTS "Trip members can view expenses" ON public.expenses;
CREATE POLICY "Trip members can view expenses"
  ON public.expenses FOR SELECT
  USING (
    is_trip_member(trip_id, auth.uid())
    AND (
      is_deleted = false                      -- members only see live expenses
      OR can_manage_trip(trip_id, auth.uid()) -- admins see deleted too
    )
  );

-- 5. Purge function: delete non-current versions 7+ days after trip closes
--    Current version (version_number = current_version) is NEVER touched here.
CREATE OR REPLACE FUNCTION public.purge_old_expense_versions(p_trip_id UUID)
RETURNS INTEGER AS $$
DECLARE
  trip_closed_at TIMESTAMPTZ;
  deleted_count  INTEGER;
BEGIN
  SELECT closed_at INTO trip_closed_at FROM public.trips WHERE id = p_trip_id;

  -- Only purge if trip has been closed for at least 7 days
  IF trip_closed_at IS NULL OR trip_closed_at > NOW() - INTERVAL '7 days' THEN
    RETURN 0;
  END IF;

  DELETE FROM public.expense_versions ev
  WHERE ev.trip_id = p_trip_id
    AND ev.version_number < (
      SELECT e.current_version FROM public.expenses e WHERE e.id = ev.expense_id
    );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.purge_old_expense_versions(UUID) TO authenticated;
