-- Settlement requests are organizer-created, then confirmed by the involved
-- payer/receiver. The organizer closes the settlement after both sides confirm.

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS settlement_type TEXT NOT NULL DEFAULT 'family'
    CHECK (settlement_type IN ('family', 'person')),
  ADD COLUMN IF NOT EXISTS from_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS to_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ;

ALTER TABLE public.settlements
  ALTER COLUMN from_family_id DROP NOT NULL,
  ALTER COLUMN to_family_id DROP NOT NULL;

ALTER TABLE public.settlements DROP CONSTRAINT IF EXISTS settlements_status_check;
ALTER TABLE public.settlements ADD CONSTRAINT settlements_status_check
  CHECK (status IN ('proposed','payer_approved','receiver_approved','confirmed','completed','disputed','cancelled'));

ALTER TABLE public.settlements DROP CONSTRAINT IF EXISTS settlements_subject_check;
ALTER TABLE public.settlements ADD CONSTRAINT settlements_subject_check
  CHECK (
    (
      settlement_type = 'family'
      AND from_family_id IS NOT NULL
      AND to_family_id IS NOT NULL
      AND from_user_id IS NULL
      AND to_user_id IS NULL
      AND from_family_id <> to_family_id
    )
    OR
    (
      settlement_type = 'person'
      AND from_user_id IS NOT NULL
      AND to_user_id IS NOT NULL
      AND from_family_id IS NULL
      AND to_family_id IS NULL
      AND from_user_id <> to_user_id
    )
  );

CREATE INDEX IF NOT EXISTS settlements_from_user_id_idx ON public.settlements(from_user_id);
CREATE INDEX IF NOT EXISTS settlements_to_user_id_idx ON public.settlements(to_user_id);

CREATE OR REPLACE FUNCTION public.can_confirm_settlement(
  settlement_uuid UUID,
  user_uuid UUID
)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.settlements s
    WHERE s.id = settlement_uuid
      AND (
        (s.settlement_type = 'person' AND user_uuid IN (s.from_user_id, s.to_user_id))
        OR
        (
          s.settlement_type = 'family'
          AND EXISTS (
            SELECT 1
            FROM public.family_members fm
            WHERE fm.trip_id = s.trip_id
              AND fm.user_id = user_uuid
              AND fm.family_id IN (s.from_family_id, s.to_family_id)
          )
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.can_confirm_settlement(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS "Trip organizer can update settlements" ON public.settlements;
DROP POLICY IF EXISTS "Trip organizer or involved parties can update settlements" ON public.settlements;
CREATE POLICY "Trip organizer or involved parties can update settlements"
  ON public.settlements FOR UPDATE
  USING (
    public.is_trip_organizer(trip_id, auth.uid())
    OR public.can_confirm_settlement(id, auth.uid())
  )
  WITH CHECK (
    public.is_trip_organizer(trip_id, auth.uid())
    OR public.can_confirm_settlement(id, auth.uid())
  );

CREATE OR REPLACE FUNCTION public.enforce_settlement_status_flow()
RETURNS TRIGGER AS $$
DECLARE
  actor UUID := auth.uid();
  actor_is_organizer BOOLEAN;
  actor_is_involved BOOLEAN;
  actor_is_payer BOOLEAN;
  actor_is_receiver BOOLEAN;
  old_payer_confirmed BOOLEAN;
  old_receiver_confirmed BOOLEAN;
  new_payer_confirmed BOOLEAN;
  new_receiver_confirmed BOOLEAN;
BEGIN
  actor_is_organizer := public.is_trip_organizer(OLD.trip_id, actor);
  actor_is_involved := public.can_confirm_settlement(OLD.id, actor);
  actor_is_payer := (
    (OLD.settlement_type = 'person' AND OLD.from_user_id = actor)
    OR (
      OLD.settlement_type = 'family'
      AND EXISTS (
        SELECT 1
        FROM public.family_members fm
        WHERE fm.trip_id = OLD.trip_id
          AND fm.user_id = actor
          AND fm.family_id = OLD.from_family_id
      )
    )
  );
  actor_is_receiver := (
    (OLD.settlement_type = 'person' AND OLD.to_user_id = actor)
    OR (
      OLD.settlement_type = 'family'
      AND EXISTS (
        SELECT 1
        FROM public.family_members fm
        WHERE fm.trip_id = OLD.trip_id
          AND fm.user_id = actor
          AND fm.family_id = OLD.to_family_id
      )
    )
  );

  IF OLD.trip_id <> NEW.trip_id
    OR COALESCE(OLD.from_family_id::TEXT, '') <> COALESCE(NEW.from_family_id::TEXT, '')
    OR COALESCE(OLD.to_family_id::TEXT, '') <> COALESCE(NEW.to_family_id::TEXT, '')
    OR COALESCE(OLD.from_user_id::TEXT, '') <> COALESCE(NEW.from_user_id::TEXT, '')
    OR COALESCE(OLD.to_user_id::TEXT, '') <> COALESCE(NEW.to_user_id::TEXT, '')
    OR OLD.amount <> NEW.amount
    OR OLD.currency <> NEW.currency
    OR OLD.settlement_type <> NEW.settlement_type THEN
    RAISE EXCEPTION 'Settlement payment details cannot be changed';
  END IF;

  IF actor_is_organizer THEN
    RETURN NEW;
  END IF;

  IF NOT actor_is_involved THEN
    RAISE EXCEPTION 'Only involved parties or the trip organizer can update this settlement';
  END IF;

  old_payer_confirmed := OLD.payer_family_approved_at IS NOT NULL;
  old_receiver_confirmed := OLD.receiver_family_approved_at IS NOT NULL;
  new_payer_confirmed := NEW.payer_family_approved_at IS NOT NULL;
  new_receiver_confirmed := NEW.receiver_family_approved_at IS NOT NULL;

  IF COALESCE(OLD.cancel_reason, '') <> COALESCE(NEW.cancel_reason, '')
    OR COALESCE(OLD.dispute_reason, '') <> COALESCE(NEW.dispute_reason, '')
    OR COALESCE(OLD.deleted_at::TEXT, '') <> COALESCE(NEW.deleted_at::TEXT, '')
    OR COALESCE(OLD.closed_at::TEXT, '') <> COALESCE(NEW.closed_at::TEXT, '')
    OR COALESCE(OLD.notified_at::TEXT, '') <> COALESCE(NEW.notified_at::TEXT, '')
    OR COALESCE(OLD.emailed_at::TEXT, '') <> COALESCE(NEW.emailed_at::TEXT, '') THEN
    RAISE EXCEPTION 'Only the trip organizer can manage settlement records';
  END IF;

  IF (old_payer_confirmed AND NOT new_payer_confirmed)
    OR (old_receiver_confirmed AND NOT new_receiver_confirmed)
    OR (NOT old_payer_confirmed AND new_payer_confirmed AND NOT actor_is_payer)
    OR (NOT old_receiver_confirmed AND new_receiver_confirmed AND NOT actor_is_receiver)
    OR (NOT old_payer_confirmed AND NOT old_receiver_confirmed AND NEW.status NOT IN ('payer_approved','receiver_approved'))
    OR (new_payer_confirmed AND new_receiver_confirmed AND NEW.status <> 'confirmed')
    OR (new_payer_confirmed AND NOT new_receiver_confirmed AND NEW.status <> 'payer_approved')
    OR (new_receiver_confirmed AND NOT new_payer_confirmed AND NEW.status <> 'receiver_approved')
    OR NEW.status IN ('completed','cancelled','disputed') THEN
    RAISE EXCEPTION 'Invalid settlement confirmation update';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS settlements_status_flow ON public.settlements;
CREATE TRIGGER settlements_status_flow BEFORE UPDATE ON public.settlements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_settlement_status_flow();

NOTIFY pgrst, 'reload schema';
