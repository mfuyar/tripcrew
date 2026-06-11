-- Settlement flow is now organizer-only: the trip organizer records completed
-- family settlements directly. Family-side approval states remain readable for
-- legacy rows, but new create/update/delete actions are organizer-only.

CREATE OR REPLACE FUNCTION public.can_act_on_settlement(
  trip_uuid UUID,
  from_family_uuid UUID,
  to_family_uuid UUID,
  user_uuid UUID
)
RETURNS BOOLEAN AS $$
  SELECT public.is_trip_organizer(trip_uuid, user_uuid);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.can_act_on_settlement(UUID, UUID, UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS "Trip members can create settlements" ON public.settlements;
DROP POLICY IF EXISTS "Involved families and organizer can create settlements" ON public.settlements;
DROP POLICY IF EXISTS "Trip organizer can create settlements" ON public.settlements;
CREATE POLICY "Trip organizer can create settlements"
  ON public.settlements FOR INSERT
  WITH CHECK (
    public.is_trip_organizer(trip_id, auth.uid())
  );

DROP POLICY IF EXISTS "Trip members can update settlement status" ON public.settlements;
DROP POLICY IF EXISTS "Settlement payer or receiver can update status" ON public.settlements;
DROP POLICY IF EXISTS "Involved families and organizer can update settlements" ON public.settlements;
DROP POLICY IF EXISTS "Trip organizer can update settlements" ON public.settlements;
CREATE POLICY "Trip organizer can update settlements"
  ON public.settlements FOR UPDATE
  USING (
    public.is_trip_organizer(trip_id, auth.uid())
  )
  WITH CHECK (
    public.is_trip_organizer(trip_id, auth.uid())
  );

DROP POLICY IF EXISTS "Trip organizer can delete settlements" ON public.settlements;
CREATE POLICY "Trip organizer can delete settlements"
  ON public.settlements FOR DELETE
  USING (
    public.is_trip_organizer(trip_id, auth.uid())
  );

CREATE OR REPLACE FUNCTION public.enforce_settlement_status_flow()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.trip_id <> NEW.trip_id
    OR OLD.from_family_id <> NEW.from_family_id
    OR OLD.to_family_id <> NEW.to_family_id
    OR OLD.amount <> NEW.amount
    OR OLD.currency <> NEW.currency THEN
    RAISE EXCEPTION 'Settlement payment details cannot be changed';
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    NEW.status = 'cancelled'
    OR (OLD.status = 'proposed' AND NEW.status IN ('payer_approved','receiver_approved','disputed'))
    OR (OLD.status = 'payer_approved' AND NEW.status IN ('completed','disputed'))
    OR (OLD.status = 'receiver_approved' AND NEW.status IN ('completed','disputed'))
    OR (OLD.status = 'completed' AND NEW.status = 'disputed')
    OR (OLD.status = 'disputed' AND NEW.status IN ('payer_approved','receiver_approved','completed','proposed'))
  ) THEN
    RAISE EXCEPTION 'Invalid settlement status transition: % to %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS settlements_status_flow ON public.settlements;
CREATE TRIGGER settlements_status_flow BEFORE UPDATE ON public.settlements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_settlement_status_flow();

NOTIFY pgrst, 'reload schema';
