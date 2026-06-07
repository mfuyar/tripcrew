-- Settlement workflow v2: approval-based status machine

-- 1. Add new columns
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS payer_family_approved_at TIMESTAMPTZ;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS receiver_family_approved_at TIMESTAMPTZ;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS dispute_reason TEXT;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- 2. Drop old CHECK constraint so UPDATE statements can write new status values
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_status_check;

-- 3. Migrate existing data to new statuses (no constraint active yet)
UPDATE settlements SET status = 'proposed'       WHERE status = 'pending';
UPDATE settlements SET
  status = 'payer_approved',
  payer_family_approved_at = COALESCE(updated_at, created_at)
WHERE status = 'paid';
UPDATE settlements SET
  status = 'completed',
  payer_family_approved_at = COALESCE(confirmed_at, updated_at, created_at),
  receiver_family_approved_at = COALESCE(confirmed_at, updated_at, created_at)
WHERE status = 'confirmed';
-- disputed stays as disputed; no timestamp data to recover

-- 4. Add new CHECK constraint — all rows now have valid new status values
ALTER TABLE settlements ADD CONSTRAINT settlements_status_check
  CHECK (status IN ('proposed','payer_approved','receiver_approved','completed','disputed','cancelled'));

-- 5. Rewrite trigger function for new status transitions
CREATE OR REPLACE FUNCTION enforce_settlement_status_flow()
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
    (OLD.status = 'proposed'          AND NEW.status IN ('payer_approved','receiver_approved','disputed','cancelled'))
    OR (OLD.status = 'payer_approved'   AND NEW.status IN ('completed','disputed','cancelled'))
    OR (OLD.status = 'receiver_approved' AND NEW.status IN ('completed','disputed','cancelled'))
    OR (OLD.status = 'completed'        AND NEW.status = 'disputed')
    OR (OLD.status = 'disputed'         AND NEW.status IN ('payer_approved','receiver_approved','proposed','cancelled'))
  ) THEN
    RAISE EXCEPTION 'Invalid settlement status transition: % to %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS settlements_status_flow ON settlements;
CREATE TRIGGER settlements_status_flow BEFORE UPDATE ON settlements
  FOR EACH ROW EXECUTE FUNCTION enforce_settlement_status_flow();
