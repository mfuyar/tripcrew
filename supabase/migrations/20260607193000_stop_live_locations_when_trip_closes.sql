-- Stop live location sharing at the database boundary when a trip is no longer active.

CREATE OR REPLACE FUNCTION public.trip_allows_live_location(p_trip_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = p_trip_id
      AND t.is_active = true
      AND COALESCE(t.status, 'active') = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.clear_live_locations_for_inactive_trip()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    NEW.is_active = false
    OR COALESCE(NEW.status, 'active') <> 'active'
  ) AND (
    OLD.is_active IS DISTINCT FROM NEW.is_active
    OR OLD.status IS DISTINCT FROM NEW.status
  ) THEN
    DELETE FROM public.live_locations WHERE trip_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS clear_live_locations_for_inactive_trip ON public.trips;
CREATE TRIGGER clear_live_locations_for_inactive_trip
  AFTER UPDATE OF is_active, status ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_live_locations_for_inactive_trip();

DROP POLICY IF EXISTS "Users can upsert their own location" ON public.live_locations;
CREATE POLICY "Users can upsert their own location"
  ON public.live_locations FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.trip_allows_live_location(trip_id)
    AND EXISTS (
      SELECT 1 FROM public.trip_members
      WHERE trip_id = live_locations.trip_id
        AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their own location" ON public.live_locations;
CREATE POLICY "Users can update their own location"
  ON public.live_locations FOR UPDATE
  USING (
    user_id = auth.uid()
    AND public.trip_allows_live_location(trip_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.trip_allows_live_location(trip_id)
  );

NOTIFY pgrst, 'reload schema';
