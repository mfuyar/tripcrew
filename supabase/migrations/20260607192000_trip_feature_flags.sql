-- Per-trip feature flags.
-- Missing row means enabled, so all existing and new trips keep every feature on
-- until a global admin disables a specific feature for a specific trip.

CREATE TABLE IF NOT EXISTS public.trip_feature_flags (
  trip_id     UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  updated_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (trip_id, feature_key),
  CHECK (feature_key IN (
    'community_spots',
    'families',
    'expenses',
    'chat',
    'album',
    'itinerary',
    'grocery',
    'packing',
    'cars',
    'polls',
    'emergency',
    'announcements',
    'live_location',
    'receipt_scan'
  ))
);

ALTER TABLE public.trip_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Trip members can view feature flags" ON public.trip_feature_flags;
CREATE POLICY "Trip members can view feature flags"
  ON public.trip_feature_flags FOR SELECT
  USING (
    public.is_trip_member(trip_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Global admins can manage feature flags" ON public.trip_feature_flags;
CREATE POLICY "Global admins can manage feature flags"
  ON public.trip_feature_flags FOR ALL
  USING (EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.set_trip_feature_flag(
  p_trip_id UUID,
  p_feature_key TEXT,
  p_enabled BOOLEAN
)
RETURNS public.trip_feature_flags AS $$
DECLARE
  result public.trip_feature_flags;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.global_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only global admins can manage feature flags';
  END IF;

  INSERT INTO public.trip_feature_flags (trip_id, feature_key, enabled, updated_by, updated_at)
  VALUES (p_trip_id, p_feature_key, p_enabled, auth.uid(), NOW())
  ON CONFLICT (trip_id, feature_key) DO UPDATE
  SET enabled = EXCLUDED.enabled,
      updated_by = EXCLUDED.updated_by,
      updated_at = EXCLUDED.updated_at
  RETURNING * INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.set_trip_feature_flag(UUID, TEXT, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
