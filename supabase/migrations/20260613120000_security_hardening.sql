-- ─── TripCrew security hardening ───────────────────────────────────────────
-- Keep trip data isolated even when the same people participate in multiple
-- trips. This migration removes broad read/join paths, tightens storage, and
-- rejects rows that link records across trips.

-- ── 1. Trips are not globally selectable ───────────────────────────────────
DROP POLICY IF EXISTS "Anyone can look up trips by invite code" ON public.trips;

-- Joining by invite code happens through request_trip_join_by_code(), which is
-- SECURITY DEFINER and returns only the user's own request. Direct trip SELECTs
-- stay limited to members, requesters, and admins via the other policies.

CREATE OR REPLACE FUNCTION public.is_trip_creator(trip_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.id = trip_uuid
      AND t.created_by = user_uuid
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.is_trip_creator(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_trip_creator(UUID, UUID) TO authenticated;

-- ── 2. Direct trip membership inserts cannot bypass approval ───────────────
DROP POLICY IF EXISTS "Authenticated users can join trips" ON public.trip_members;
CREATE POLICY "Users can insert approved memberships"
  ON public.trip_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      -- Initial organizer row immediately after creating the trip.
      (
        role = 'trip_organizer'
        AND family_id IS NULL
        AND public.is_trip_creator(trip_members.trip_id, auth.uid())
      )
      OR
      -- Re-joining after manager approval. New direct joins start as members.
      (
        role = 'member'
        AND EXISTS (
          SELECT 1
          FROM public.trip_join_requests tjr
          WHERE tjr.trip_id = trip_members.trip_id
            AND tjr.user_id = auth.uid()
            AND tjr.status = 'approved'
        )
      )
    )
    AND (
      family_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.families f
        WHERE f.id = trip_members.family_id
          AND f.trip_id = trip_members.trip_id
      )
    )
  );

-- ── 3. Storage bucket is private, with path-aware policies ─────────────────
UPDATE storage.buckets
SET "public" = false
WHERE id = 'trip-media';

CREATE OR REPLACE FUNCTION public.storage_trip_id(object_name TEXT)
RETURNS UUID AS $$
DECLARE
  candidate TEXT;
BEGIN
  candidate := CASE
    WHEN object_name LIKE 'chat/%' THEN split_part(object_name, '/', 2)
    ELSE split_part(object_name, '/', 1)
  END;

  IF candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN candidate::UUID;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.storage_object_user_id(object_name TEXT)
RETURNS UUID AS $$
DECLARE
  candidate TEXT;
BEGIN
  candidate := CASE
    WHEN object_name LIKE 'chat/%' THEN split_part(object_name, '/', 3)
    WHEN object_name LIKE 'community-spots/%' THEN split_part(object_name, '/', 2)
    ELSE split_part(object_name, '/', 2)
  END;

  IF candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN candidate::UUID;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.storage_trip_id(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.storage_object_user_id(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_trip_id(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_object_user_id(TEXT) TO authenticated;

DROP POLICY IF EXISTS "Trip media objects are readable by trip members" ON storage.objects;
CREATE POLICY "Trip media objects are readable by trip members"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'trip-media'
    AND public.storage_trip_id(name) IS NOT NULL
    AND public.is_trip_member(public.storage_trip_id(name), auth.uid())
  );

DROP POLICY IF EXISTS "Trip members can upload trip media objects" ON storage.objects;
CREATE POLICY "Trip members can upload trip media objects"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'trip-media'
    AND public.storage_trip_id(name) IS NOT NULL
    AND public.is_trip_member(public.storage_trip_id(name), auth.uid())
    AND public.storage_object_user_id(name) = auth.uid()
  );

DROP POLICY IF EXISTS "Trip uploaders and managers can delete trip media objects" ON storage.objects;
CREATE POLICY "Trip uploaders and managers can delete trip media objects"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'trip-media'
    AND public.storage_trip_id(name) IS NOT NULL
    AND (
      public.storage_object_user_id(name) = auth.uid()
      OR public.can_manage_trip(public.storage_trip_id(name), auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated users can read community spot photos" ON storage.objects;
CREATE POLICY "Authenticated users can read community spot photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'trip-media'
    AND name LIKE 'community-spots/%'
    AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Users can upload their own community spot photos" ON storage.objects;
CREATE POLICY "Users can upload their own community spot photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'trip-media'
    AND name LIKE 'community-spots/%'
    AND public.storage_object_user_id(name) = auth.uid()
  );

DROP POLICY IF EXISTS "Users can delete their own community spot photos" ON storage.objects;
CREATE POLICY "Users can delete their own community spot photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'trip-media'
    AND name LIKE 'community-spots/%'
    AND public.storage_object_user_id(name) = auth.uid()
  );

-- ── 4. Same-trip integrity for denormalized trip_id columns ────────────────
CREATE OR REPLACE FUNCTION public.enforce_same_trip_references()
RETURNS TRIGGER AS $$
DECLARE
  related_trip UUID;
BEGIN
  IF TG_TABLE_NAME = 'trip_members' THEN
    IF NEW.family_id IS NOT NULL THEN
      SELECT trip_id INTO related_trip FROM public.families WHERE id = NEW.family_id;
      IF related_trip IS DISTINCT FROM NEW.trip_id THEN
        RAISE EXCEPTION 'trip_members.family_id must belong to the same trip';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'family_members' THEN
    SELECT trip_id INTO related_trip FROM public.families WHERE id = NEW.family_id;
    IF related_trip IS DISTINCT FROM NEW.trip_id THEN
      RAISE EXCEPTION 'family_members.family_id must belong to the same trip';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'expenses' THEN
    IF NEW.paid_by_family_id IS NOT NULL THEN
      SELECT trip_id INTO related_trip FROM public.families WHERE id = NEW.paid_by_family_id;
      IF related_trip IS DISTINCT FROM NEW.trip_id THEN
        RAISE EXCEPTION 'expenses.paid_by_family_id must belong to the same trip';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'expense_splits' THEN
    SELECT trip_id INTO related_trip FROM public.expenses WHERE id = NEW.expense_id;
    IF related_trip IS DISTINCT FROM NEW.trip_id THEN
      RAISE EXCEPTION 'expense_splits.expense_id must belong to the same trip';
    END IF;

    SELECT trip_id INTO related_trip FROM public.families WHERE id = NEW.family_id;
    IF related_trip IS DISTINCT FROM NEW.trip_id THEN
      RAISE EXCEPTION 'expense_splits.family_id must belong to the same trip';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'settlements' THEN
    IF NEW.from_family_id IS NOT NULL THEN
      SELECT trip_id INTO related_trip FROM public.families WHERE id = NEW.from_family_id;
      IF related_trip IS DISTINCT FROM NEW.trip_id THEN
        RAISE EXCEPTION 'settlements.from_family_id must belong to the same trip';
      END IF;
    END IF;

    IF NEW.to_family_id IS NOT NULL THEN
      SELECT trip_id INTO related_trip FROM public.families WHERE id = NEW.to_family_id;
      IF related_trip IS DISTINCT FROM NEW.trip_id THEN
        RAISE EXCEPTION 'settlements.to_family_id must belong to the same trip';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME IN ('messages', 'trip_media', 'emergency_info', 'live_locations') THEN
    IF NEW.family_id IS NOT NULL THEN
      SELECT trip_id INTO related_trip FROM public.families WHERE id = NEW.family_id;
      IF related_trip IS DISTINCT FROM NEW.trip_id THEN
        RAISE EXCEPTION 'family_id must belong to the same trip';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'receipt_scans' THEN
    IF NEW.expense_id IS NOT NULL THEN
      SELECT trip_id INTO related_trip FROM public.expenses WHERE id = NEW.expense_id;
      IF related_trip IS DISTINCT FROM NEW.trip_id THEN
        RAISE EXCEPTION 'receipt_scans.expense_id must belong to the same trip';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME IN ('grocery_items', 'packing_items') THEN
    IF NEW.assigned_family_id IS NOT NULL THEN
      SELECT trip_id INTO related_trip FROM public.families WHERE id = NEW.assigned_family_id;
      IF related_trip IS DISTINCT FROM NEW.trip_id THEN
        RAISE EXCEPTION 'assigned_family_id must belong to the same trip';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'itinerary_attendance' THEN
    SELECT trip_id INTO related_trip FROM public.itinerary_items WHERE id = NEW.itinerary_item_id;
    IF related_trip IS DISTINCT FROM NEW.trip_id THEN
      RAISE EXCEPTION 'itinerary_attendance.itinerary_item_id must belong to the same trip';
    END IF;

    SELECT trip_id INTO related_trip FROM public.families WHERE id = NEW.family_id;
    IF related_trip IS DISTINCT FROM NEW.trip_id THEN
      RAISE EXCEPTION 'itinerary_attendance.family_id must belong to the same trip';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'cars' THEN
    SELECT trip_id INTO related_trip FROM public.families WHERE id = NEW.driver_family_id;
    IF related_trip IS DISTINCT FROM NEW.trip_id THEN
      RAISE EXCEPTION 'cars.driver_family_id must belong to the same trip';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'car_passengers' THEN
    SELECT trip_id INTO related_trip FROM public.cars WHERE id = NEW.car_id;
    IF related_trip IS DISTINCT FROM NEW.trip_id THEN
      RAISE EXCEPTION 'car_passengers.car_id must belong to the same trip';
    END IF;

    SELECT trip_id INTO related_trip FROM public.families WHERE id = NEW.family_id;
    IF related_trip IS DISTINCT FROM NEW.trip_id THEN
      RAISE EXCEPTION 'car_passengers.family_id must belong to the same trip';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'poll_options' THEN
    SELECT trip_id INTO related_trip FROM public.polls WHERE id = NEW.poll_id;
    IF related_trip IS DISTINCT FROM NEW.trip_id THEN
      RAISE EXCEPTION 'poll_options.poll_id must belong to the same trip';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'poll_votes' THEN
    SELECT trip_id INTO related_trip FROM public.polls WHERE id = NEW.poll_id;
    IF related_trip IS DISTINCT FROM NEW.trip_id THEN
      RAISE EXCEPTION 'poll_votes.poll_id must belong to the same trip';
    END IF;

    SELECT trip_id INTO related_trip FROM public.poll_options WHERE id = NEW.poll_option_id;
    IF related_trip IS DISTINCT FROM NEW.trip_id THEN
      RAISE EXCEPTION 'poll_votes.poll_option_id must belong to the same trip';
    END IF;

    IF NEW.family_id IS NOT NULL THEN
      SELECT trip_id INTO related_trip FROM public.families WHERE id = NEW.family_id;
      IF related_trip IS DISTINCT FROM NEW.trip_id THEN
        RAISE EXCEPTION 'poll_votes.family_id must belong to the same trip';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS enforce_same_trip_trip_members ON public.trip_members;
CREATE TRIGGER enforce_same_trip_trip_members
  BEFORE INSERT OR UPDATE OF trip_id, family_id ON public.trip_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_trip_references();

DROP TRIGGER IF EXISTS enforce_same_trip_family_members ON public.family_members;
CREATE TRIGGER enforce_same_trip_family_members
  BEFORE INSERT OR UPDATE OF trip_id, family_id ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_trip_references();

DROP TRIGGER IF EXISTS enforce_same_trip_expenses ON public.expenses;
CREATE TRIGGER enforce_same_trip_expenses
  BEFORE INSERT OR UPDATE OF trip_id, paid_by_family_id ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_trip_references();

DROP TRIGGER IF EXISTS enforce_same_trip_expense_splits ON public.expense_splits;
CREATE TRIGGER enforce_same_trip_expense_splits
  BEFORE INSERT OR UPDATE OF trip_id, expense_id, family_id ON public.expense_splits
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_trip_references();

DROP TRIGGER IF EXISTS enforce_same_trip_settlements ON public.settlements;
CREATE TRIGGER enforce_same_trip_settlements
  BEFORE INSERT OR UPDATE OF trip_id, from_family_id, to_family_id ON public.settlements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_trip_references();

DROP TRIGGER IF EXISTS enforce_same_trip_messages ON public.messages;
CREATE TRIGGER enforce_same_trip_messages
  BEFORE INSERT OR UPDATE OF trip_id, family_id ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_trip_references();

DROP TRIGGER IF EXISTS enforce_same_trip_trip_media ON public.trip_media;
CREATE TRIGGER enforce_same_trip_trip_media
  BEFORE INSERT OR UPDATE OF trip_id, family_id ON public.trip_media
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_trip_references();

DROP TRIGGER IF EXISTS enforce_same_trip_emergency_info ON public.emergency_info;
CREATE TRIGGER enforce_same_trip_emergency_info
  BEFORE INSERT OR UPDATE OF trip_id, family_id ON public.emergency_info
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_trip_references();

DROP TRIGGER IF EXISTS enforce_same_trip_poll_votes ON public.poll_votes;
CREATE TRIGGER enforce_same_trip_poll_votes
  BEFORE INSERT OR UPDATE OF trip_id, poll_id, poll_option_id, family_id ON public.poll_votes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_trip_references();

DROP TRIGGER IF EXISTS enforce_same_trip_live_locations ON public.live_locations;
CREATE TRIGGER enforce_same_trip_live_locations
  BEFORE INSERT OR UPDATE OF trip_id, family_id ON public.live_locations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_trip_references();

DROP TRIGGER IF EXISTS enforce_same_trip_receipt_scans ON public.receipt_scans;
CREATE TRIGGER enforce_same_trip_receipt_scans
  BEFORE INSERT OR UPDATE OF trip_id, expense_id ON public.receipt_scans
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_trip_references();

DROP TRIGGER IF EXISTS enforce_same_trip_grocery_items ON public.grocery_items;
CREATE TRIGGER enforce_same_trip_grocery_items
  BEFORE INSERT OR UPDATE OF trip_id, assigned_family_id ON public.grocery_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_trip_references();

DROP TRIGGER IF EXISTS enforce_same_trip_packing_items ON public.packing_items;
CREATE TRIGGER enforce_same_trip_packing_items
  BEFORE INSERT OR UPDATE OF trip_id, assigned_family_id ON public.packing_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_trip_references();

DROP TRIGGER IF EXISTS enforce_same_trip_itinerary_attendance ON public.itinerary_attendance;
CREATE TRIGGER enforce_same_trip_itinerary_attendance
  BEFORE INSERT OR UPDATE OF trip_id, itinerary_item_id, family_id ON public.itinerary_attendance
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_trip_references();

DROP TRIGGER IF EXISTS enforce_same_trip_cars ON public.cars;
CREATE TRIGGER enforce_same_trip_cars
  BEFORE INSERT OR UPDATE OF trip_id, driver_family_id ON public.cars
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_trip_references();

DROP TRIGGER IF EXISTS enforce_same_trip_car_passengers ON public.car_passengers;
CREATE TRIGGER enforce_same_trip_car_passengers
  BEFORE INSERT OR UPDATE OF trip_id, car_id, family_id ON public.car_passengers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_trip_references();

DROP TRIGGER IF EXISTS enforce_same_trip_poll_options ON public.poll_options;
CREATE TRIGGER enforce_same_trip_poll_options
  BEFORE INSERT OR UPDATE OF trip_id, poll_id ON public.poll_options
  FOR EACH ROW EXECUTE FUNCTION public.enforce_same_trip_references();

NOTIFY pgrst, 'reload schema';
