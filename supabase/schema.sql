-- ─── TripCrew Database Schema ─────────────────────────────────────────────────
-- Run this in your Supabase SQL editor to set up all tables.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── updated_at trigger function ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT NOT NULL DEFAULT '',
  avatar_url  TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Trips ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  destination   TEXT NOT NULL,
  description   TEXT,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  cover_image_url TEXT,
  created_by    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  invite_code   TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_dates CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS trips_created_by_idx ON trips(created_by);
CREATE INDEX IF NOT EXISTS trips_invite_code_idx ON trips(invite_code);
CREATE TRIGGER trips_updated_at BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Trip Members ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trip_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  family_id   UUID,
  role        TEXT NOT NULL DEFAULT 'member'
                CHECK (role IN ('trip_organizer','trip_admin','family_admin','member','viewer')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, user_id)
);
CREATE INDEX IF NOT EXISTS trip_members_trip_id_idx ON trip_members(trip_id);
CREATE INDEX IF NOT EXISTS trip_members_user_id_idx ON trip_members(user_id);

-- ─── Families ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS families (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  adults_count    INTEGER NOT NULL DEFAULT 2 CHECK (adults_count >= 1),
  children_count  INTEGER NOT NULL DEFAULT 0 CHECK (children_count >= 0),
  notes           TEXT,
  color           TEXT,
  created_by      UUID NOT NULL REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS families_trip_id_idx ON families(trip_id);
CREATE TRIGGER families_updated_at BEFORE UPDATE ON families
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add FK from trip_members to families (after families table)
ALTER TABLE trip_members
  ADD CONSTRAINT trip_members_family_id_fk
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE SET NULL;

-- ─── Family Members ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS family_members (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  family_id          UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  trip_id            UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_admin           BOOLEAN NOT NULL DEFAULT false,
  push_talk_enabled  BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (family_id, user_id)
);
CREATE INDEX IF NOT EXISTS family_members_family_id_idx ON family_members(family_id);
CREATE INDEX IF NOT EXISTS family_members_user_id_idx ON family_members(user_id);

-- ─── Expenses ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id             UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  amount              NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency            TEXT NOT NULL DEFAULT 'USD',
  category            TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('lodging','groceries','gas','restaurant','activity','tickets','parking','tolls','supplies','other')),
  paid_by_family_id   UUID NOT NULL REFERENCES families(id),
  paid_by_user_id     UUID NOT NULL REFERENCES profiles(id),
  split_method        TEXT NOT NULL DEFAULT 'equal_by_family'
    CHECK (split_method IN ('equal_by_family','equal_by_person','adults_only','children_count_half','custom_percentage','custom_family_amounts','selected_families_only')),
  date                DATE NOT NULL DEFAULT CURRENT_DATE,
  notes               TEXT,
  receipt_url         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS expenses_trip_id_idx ON expenses(trip_id);
CREATE INDEX IF NOT EXISTS expenses_paid_by_family_id_idx ON expenses(paid_by_family_id);
CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses(date);
CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Expense Splits ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_splits (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id    UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  trip_id       UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  family_id     UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  share_amount  NUMERIC(12,2) NOT NULL,
  percentage    NUMERIC(5,2),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS expense_splits_expense_id_idx ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS expense_splits_trip_id_idx ON expense_splits(trip_id);
CREATE INDEX IF NOT EXISTS expense_splits_family_id_idx ON expense_splits(family_id);

CREATE OR REPLACE FUNCTION replace_expense_splits(
  expense_uuid UUID,
  trip_uuid UUID,
  shares_json JSONB
)
RETURNS SETOF expense_splits AS $$
DECLARE
  expense_total NUMERIC;
  split_total NUMERIC;
BEGIN
  IF jsonb_array_length(shares_json) = 0 THEN
    RAISE EXCEPTION 'Expense must have at least one split';
  END IF;

  SELECT amount INTO expense_total
  FROM expenses
  WHERE id = expense_uuid AND trip_id = trip_uuid;

  IF expense_total IS NULL THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  SELECT COALESCE(SUM((share_item->>'share_amount')::NUMERIC), 0)
  INTO split_total
  FROM jsonb_array_elements(shares_json) AS share_item;

  IF ABS(split_total - expense_total) > 0.01 THEN
    RAISE EXCEPTION 'Expense splits must sum to expense amount';
  END IF;

  DELETE FROM expense_splits
  WHERE expense_id = expense_uuid;

  RETURN QUERY
  INSERT INTO expense_splits (
    expense_id,
    trip_id,
    family_id,
    share_amount,
    percentage
  )
  SELECT
    expense_uuid,
    trip_uuid,
    (share_item->>'family_id')::UUID,
    (share_item->>'share_amount')::NUMERIC,
    NULLIF(share_item->>'percentage', '')::NUMERIC
  FROM jsonb_array_elements(shares_json) AS share_item
  RETURNING *;
END;
$$ LANGUAGE plpgsql;

-- ─── Settlements ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  from_family_id  UUID NOT NULL REFERENCES families(id),
  to_family_id    UUID NOT NULL REFERENCES families(id),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency        TEXT NOT NULL DEFAULT 'USD',
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','confirmed','disputed')),
  notes           TEXT,
  confirmed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlements_no_self_payment'
  ) THEN
    ALTER TABLE settlements
      ADD CONSTRAINT settlements_no_self_payment CHECK (from_family_id <> to_family_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS settlements_trip_id_idx ON settlements(trip_id);
CREATE TRIGGER settlements_updated_at BEFORE UPDATE ON settlements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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
    (OLD.status = 'pending' AND NEW.status = 'paid')
    OR (OLD.status = 'paid' AND NEW.status IN ('confirmed', 'disputed'))
    OR (OLD.status = 'disputed' AND NEW.status = 'paid')
  ) THEN
    RAISE EXCEPTION 'Invalid payment status transition: % to %', OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'confirmed' AND NEW.confirmed_at IS NULL THEN
    NEW.confirmed_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS settlements_status_flow ON settlements;
CREATE TRIGGER settlements_status_flow BEFORE UPDATE ON settlements
  FOR EACH ROW EXECUTE FUNCTION enforce_settlement_status_flow();

-- ─── Messages ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id          UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES profiles(id),
  family_id        UUID REFERENCES families(id),
  content          TEXT NOT NULL,
  message_type     TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image','audio','system')),
  media_url        TEXT,
  mime_type        TEXT,
  duration_seconds NUMERIC(6,2),
  is_push_talk     BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS messages_trip_id_idx ON messages(trip_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at);

-- ─── Trip Media ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trip_media (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id       UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  uploaded_by   UUID NOT NULL REFERENCES profiles(id),
  family_id     UUID REFERENCES families(id),
  media_type    TEXT NOT NULL CHECK (media_type IN ('photo','video','document','audio')),
  url           TEXT NOT NULL,
  thumbnail_url TEXT,
  caption       TEXT,
  file_size     INTEGER,
  mime_type     TEXT,
  taken_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS trip_media_trip_id_idx ON trip_media(trip_id);
CREATE TRIGGER trip_media_updated_at BEFORE UPDATE ON trip_media
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Itinerary Items ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS itinerary_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id             UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  description         TEXT,
  location            TEXT,
  item_type           TEXT NOT NULL DEFAULT 'activity'
    CHECK (item_type IN ('activity','meal','transport','accommodation','free_time','other')),
  start_datetime      TIMESTAMPTZ NOT NULL,
  end_datetime        TIMESTAMPTZ,
  cost_estimate       NUMERIC(12,2),
  booking_reference   TEXT,
  notes               TEXT,
  created_by          UUID NOT NULL REFERENCES profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS itinerary_items_trip_id_idx ON itinerary_items(trip_id);
CREATE INDEX IF NOT EXISTS itinerary_items_start_datetime_idx ON itinerary_items(start_datetime);
CREATE TRIGGER itinerary_items_updated_at BEFORE UPDATE ON itinerary_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Itinerary Attendance ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS itinerary_attendance (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  itinerary_item_id   UUID NOT NULL REFERENCES itinerary_items(id) ON DELETE CASCADE,
  trip_id             UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  family_id           UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  is_attending        BOOLEAN NOT NULL DEFAULT true,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (itinerary_item_id, family_id)
);

-- ─── Grocery Items ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grocery_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id             UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  quantity            TEXT,
  category            TEXT,
  assigned_family_id  UUID REFERENCES families(id),
  is_purchased        BOOLEAN NOT NULL DEFAULT false,
  purchased_by        UUID REFERENCES profiles(id),
  purchased_at        TIMESTAMPTZ,
  notes               TEXT,
  added_by            UUID NOT NULL REFERENCES profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS grocery_items_trip_id_idx ON grocery_items(trip_id);
CREATE TRIGGER grocery_items_updated_at BEFORE UPDATE ON grocery_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Packing Items ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS packing_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id             UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  category            TEXT,
  quantity            INTEGER DEFAULT 1,
  assigned_family_id  UUID REFERENCES families(id),
  status              TEXT NOT NULL DEFAULT 'unpacked'
    CHECK (status IN ('unpacked','packed','left_behind')),
  notes               TEXT,
  is_essential        BOOLEAN NOT NULL DEFAULT false,
  added_by            UUID NOT NULL REFERENCES profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS packing_items_trip_id_idx ON packing_items(trip_id);
CREATE TRIGGER packing_items_updated_at BEFORE UPDATE ON packing_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Cars ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cars (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id           UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  driver_family_id  UUID NOT NULL REFERENCES families(id),
  driver_user_id    UUID REFERENCES profiles(id),
  total_seats       INTEGER NOT NULL DEFAULT 5 CHECK (total_seats >= 1),
  notes             TEXT,
  created_by        UUID NOT NULL REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cars_trip_id_idx ON cars(trip_id);
CREATE TRIGGER cars_updated_at BEFORE UPDATE ON cars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Car Passengers ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS car_passengers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  car_id          UUID NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  family_id       UUID NOT NULL REFERENCES families(id),
  user_id         UUID REFERENCES profiles(id),
  passenger_name  TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS car_passengers_car_id_idx ON car_passengers(car_id);

-- ─── Polls ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS polls (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  deadline        TIMESTAMPTZ,
  allow_multiple  BOOLEAN NOT NULL DEFAULT false,
  created_by      UUID NOT NULL REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS polls_trip_id_idx ON polls(trip_id);
CREATE TRIGGER polls_updated_at BEFORE UPDATE ON polls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Poll Options ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poll_options (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id       UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  trip_id       UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  option_text   TEXT NOT NULL,
  votes_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS poll_options_poll_id_idx ON poll_options(poll_id);

-- ─── Poll Votes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poll_votes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id         UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  poll_option_id  UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id),
  family_id       UUID REFERENCES families(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poll_id, poll_option_id, user_id)
);
CREATE INDEX IF NOT EXISTS poll_votes_poll_id_idx ON poll_votes(poll_id);

-- Function to increment poll votes atomically
CREATE OR REPLACE FUNCTION increment_poll_votes(option_id UUID)
RETURNS void AS $$
  UPDATE poll_options SET votes_count = votes_count + 1 WHERE id = option_id;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_poll_votes(option_id UUID)
RETURNS void AS $$
  UPDATE poll_options
  SET votes_count = GREATEST(votes_count - 1, 0)
  WHERE id = option_id;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION enforce_poll_vote_rules()
RETURNS TRIGGER AS $$
DECLARE
  multiple_allowed BOOLEAN;
  poll_status TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.poll_id::text || ':' || NEW.user_id::text, 0));

  SELECT allow_multiple, status INTO multiple_allowed, poll_status
  FROM polls
  WHERE id = NEW.poll_id;

  IF poll_status IS NULL THEN
    RAISE EXCEPTION 'Poll not found';
  END IF;

  IF poll_status <> 'active' THEN
    RAISE EXCEPTION 'Poll is closed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM poll_options
    WHERE id = NEW.poll_option_id
      AND poll_id = NEW.poll_id
      AND trip_id = NEW.trip_id
  ) THEN
    RAISE EXCEPTION 'Poll option does not belong to this poll';
  END IF;

  IF multiple_allowed IS DISTINCT FROM TRUE AND EXISTS (
    SELECT 1 FROM poll_votes
    WHERE poll_id = NEW.poll_id AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'User has already voted in this poll';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS poll_vote_rules ON poll_votes;
CREATE TRIGGER poll_vote_rules BEFORE INSERT ON poll_votes
  FOR EACH ROW EXECUTE FUNCTION enforce_poll_vote_rules();

-- ─── Receipt Scans ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipt_scans (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  scanned_by      UUID NOT NULL REFERENCES profiles(id),
  image_url       TEXT NOT NULL,
  raw_text        TEXT,
  parsed_amount   NUMERIC(12,2),
  parsed_merchant TEXT,
  parsed_date     DATE,
  parsed_items    JSONB,
  expense_id      UUID REFERENCES expenses(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS receipt_scans_trip_id_idx ON receipt_scans(trip_id);

-- ─── Emergency Info ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emergency_info (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  family_id   UUID REFERENCES families(id),
  type        TEXT NOT NULL CHECK (type IN ('medical','contact','insurance','document','other')),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  is_shared   BOOLEAN NOT NULL DEFAULT true,
  added_by    UUID NOT NULL REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emergency_info_trip_id_idx ON emergency_info(trip_id);
CREATE TRIGGER emergency_info_updated_at BEFORE UPDATE ON emergency_info
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Announcements ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  priority    TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by  UUID NOT NULL REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS announcements_trip_id_idx ON announcements(trip_id);
CREATE TRIGGER announcements_updated_at BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Announcement Reads ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcement_reads (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  announcement_id   UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (announcement_id, user_id)
);

-- ─── Notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trip_id     UUID REFERENCES trips(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('expense_added','settlement_request','payment_confirmed','message','announcement','poll','push_talk','other')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  data        JSONB,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON notifications(is_read);

CREATE TABLE IF NOT EXISTS push_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  platform    TEXT NOT NULL CHECK (platform IN ('ios','android','web','unknown')),
  device_id   TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS push_tokens_active_idx ON push_tokens(is_active);
CREATE TRIGGER push_tokens_updated_at BEFORE UPDATE ON push_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Live Locations ───────────────────────────────────────────────────────────
-- Stores each user's last-known position per trip (upserted on every broadcast).
-- Deleted when the user stops sharing. Read-only for other trip members.
CREATE TABLE IF NOT EXISTS live_locations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  family_id   UUID REFERENCES families(id) ON DELETE SET NULL,
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  accuracy    DOUBLE PRECISION,
  heading     DOUBLE PRECISION,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, user_id)
);
CREATE INDEX IF NOT EXISTS live_locations_trip_id_idx ON live_locations(trip_id);

-- ─── Supabase Storage Bucket ──────────────────────────────────────────────────
-- Run this separately in Supabase dashboard > Storage, or via CLI:
-- supabase storage create trip-media --public
-- The trip-media bucket must allow:
-- image/jpeg, image/png, image/gif, image/webp, image/heic,
-- video/mp4, video/quicktime,
-- audio/mp4, audio/m4a, audio/x-m4a, audio/mpeg, audio/aac, audio/wav, audio/x-caf
