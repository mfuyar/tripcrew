-- Add soft-delete support to settlements
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Allow organizers and admins to see soft-deleted records via RLS
-- (existing RLS policies use can_manage_trip; no additional policy needed
--  as long as the app filters deleted_at IS NULL for regular queries)
