-- Settlement proposals and status changes belong only to the involved families
-- and the trip organizer. Trip admins should not be able to create, cancel, or
-- approve settlements unless they are also one of those parties.

CREATE OR REPLACE FUNCTION public.can_act_on_settlement(
  trip_uuid UUID,
  from_family_uuid UUID,
  to_family_uuid UUID,
  user_uuid UUID
)
RETURNS BOOLEAN AS $$
  SELECT
    public.is_trip_organizer(trip_uuid, user_uuid)
    OR EXISTS (
      SELECT 1
      FROM public.family_members fm
      WHERE fm.trip_id = trip_uuid
        AND fm.user_id = user_uuid
        AND fm.family_id IN (from_family_uuid, to_family_uuid)
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.can_act_on_settlement(UUID, UUID, UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS "Trip members can create settlements" ON public.settlements;
DROP POLICY IF EXISTS "Involved families and organizer can create settlements" ON public.settlements;
CREATE POLICY "Involved families and organizer can create settlements"
  ON public.settlements FOR INSERT
  WITH CHECK (
    public.can_act_on_settlement(trip_id, from_family_id, to_family_id, auth.uid())
  );

DROP POLICY IF EXISTS "Trip members can update settlement status" ON public.settlements;
DROP POLICY IF EXISTS "Settlement payer or receiver can update status" ON public.settlements;
DROP POLICY IF EXISTS "Involved families and organizer can update settlements" ON public.settlements;
CREATE POLICY "Involved families and organizer can update settlements"
  ON public.settlements FOR UPDATE
  USING (
    public.can_act_on_settlement(trip_id, from_family_id, to_family_id, auth.uid())
  )
  WITH CHECK (
    public.can_act_on_settlement(trip_id, from_family_id, to_family_id, auth.uid())
  );

-- The app can resolve a disputed settlement once both sides have approved.
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
    (OLD.status = 'proposed' AND NEW.status IN ('payer_approved','receiver_approved','disputed','cancelled'))
    OR (OLD.status = 'payer_approved' AND NEW.status IN ('completed','disputed','cancelled'))
    OR (OLD.status = 'receiver_approved' AND NEW.status IN ('completed','disputed','cancelled'))
    OR (OLD.status = 'completed' AND NEW.status = 'disputed')
    OR (OLD.status = 'disputed' AND NEW.status IN ('payer_approved','receiver_approved','completed','proposed','cancelled'))
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
