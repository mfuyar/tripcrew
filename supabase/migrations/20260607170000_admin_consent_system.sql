-- 1. Create admin_consent_requests table
CREATE TABLE IF NOT EXISTS public.admin_consent_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  admin_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','approved','rejected','revoked')),
  approved_by  UUID REFERENCES public.profiles(id),
  approved_at  TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_consent_requests
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS admin_consent_one_active
  ON public.admin_consent_requests (trip_id, admin_id)
  WHERE status IN ('pending','approved');

ALTER TABLE public.admin_consent_requests ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS admin_consent_updated_at ON public.admin_consent_requests;
CREATE TRIGGER admin_consent_updated_at BEFORE UPDATE ON public.admin_consent_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. RLS — use can_manage_trip (public-qualified) and inline global admin check
-- is_global_admin() does not exist as a DB function; check the global_admins table directly.
DROP POLICY IF EXISTS "Admin can manage own consent requests" ON public.admin_consent_requests;
CREATE POLICY "Admin can manage own consent requests"
  ON public.admin_consent_requests
  USING (
    admin_id = auth.uid()
    OR public.can_manage_trip(trip_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid())
  )
  WITH CHECK (
    admin_id = auth.uid()
    OR public.can_manage_trip(trip_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid())
  );

-- 3. has_admin_consent function
CREATE OR REPLACE FUNCTION public.has_admin_consent(trip_uuid UUID, admin_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_consent_requests
    WHERE trip_id = trip_uuid
      AND admin_id = admin_uuid
      AND status = 'approved'
      AND (expires_at IS NULL OR expires_at > NOW())
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- 4. Update private table RLS policies
-- Replace bare is_global_admin() with direct global_admins table check + consent requirement.

DROP POLICY IF EXISTS "Trip members can view messages" ON public.messages;
CREATE POLICY "Trip members can view messages"
  ON public.messages FOR SELECT
  USING (
    (is_held = false AND is_trip_member(trip_id, auth.uid()))
    OR (
      EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid())
      AND public.has_admin_consent(trip_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Global admin can view all media" ON public.trip_media;
DROP POLICY IF EXISTS "Global admin can view media with consent" ON public.trip_media;
CREATE POLICY "Global admin can view media with consent"
  ON public.trip_media FOR SELECT
  USING (
    is_trip_member(trip_id, auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid())
      AND public.has_admin_consent(trip_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Global admin can view all expenses" ON public.expenses;
DROP POLICY IF EXISTS "Global admin can view expenses with consent" ON public.expenses;
CREATE POLICY "Global admin can view expenses with consent"
  ON public.expenses FOR SELECT
  USING (
    is_trip_member(trip_id, auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid())
      AND public.has_admin_consent(trip_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Global admin can view all expense splits" ON public.expense_splits;
DROP POLICY IF EXISTS "Global admin can view expense splits with consent" ON public.expense_splits;
CREATE POLICY "Global admin can view expense splits with consent"
  ON public.expense_splits FOR SELECT
  USING (
    is_trip_member(trip_id, auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid())
      AND public.has_admin_consent(trip_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Global admin can view all family members" ON public.family_members;
DROP POLICY IF EXISTS "Global admin can view family members with consent" ON public.family_members;
CREATE POLICY "Global admin can view family members with consent"
  ON public.family_members FOR SELECT
  USING (
    is_trip_member(trip_id, auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid())
      AND public.has_admin_consent(trip_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Global admin can view all settlements" ON public.settlements;
DROP POLICY IF EXISTS "Global admin can view settlements with consent" ON public.settlements;
CREATE POLICY "Global admin can view settlements with consent"
  ON public.settlements FOR SELECT
  USING (
    is_trip_member(trip_id, auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid())
      AND public.has_admin_consent(trip_id, auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
