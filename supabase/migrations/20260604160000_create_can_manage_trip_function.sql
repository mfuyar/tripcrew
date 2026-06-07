-- can_manage_trip was referenced in join-request RLS policies but never
-- added to a migration file (only existed in rls.sql). This makes it
-- available on fresh setups and on the live database.

CREATE OR REPLACE FUNCTION public.can_manage_trip(trip_uuid uuid, user_uuid uuid)
RETURNS boolean AS $$
  SELECT public.is_global_admin(user_uuid) OR EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = trip_uuid AND user_id = user_uuid
      AND role IN ('trip_organizer', 'trip_admin')
  );
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.can_manage_trip(uuid, uuid) TO authenticated;
