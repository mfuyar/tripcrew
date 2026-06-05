-- ─── Trip status lifecycle ─────────────────────────────────────────────────────
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed', 'archived')),
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS trips_status_idx ON public.trips(status);

-- Update existing trips policy to show active + closed trips to members,
-- archived trips only to organiser/admin/global-admin.
DROP POLICY IF EXISTS "Trip members can view their trips" ON public.trips;
CREATE POLICY "Trip members can view their trips"
  ON public.trips FOR SELECT
  USING (
    (
      is_held = false
      AND is_trip_member(id, auth.uid())
      AND (status IN ('active', 'closed') OR can_manage_trip(id, auth.uid()))
    )
    OR is_global_admin(auth.uid())
  );

-- Organisers can update status
DROP POLICY IF EXISTS "Trip organizers can update trips" ON public.trips;
CREATE POLICY "Trip organizers can update trips"
  ON public.trips FOR UPDATE
  USING (is_trip_organizer(id, auth.uid()) OR is_global_admin(auth.uid()));

-- ─── Receipt image on expenses ─────────────────────────────────────────────────
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS receipt_url TEXT;
