-- Background notifications require stored Expo push tokens. This table existed
-- in schema.sql, but deployed databases only get it reliably through migrations.

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  platform    TEXT NOT NULL CHECK (platform IN ('ios','android','web','unknown')),
  device_id   TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON public.push_tokens(user_id);
CREATE INDEX IF NOT EXISTS push_tokens_active_idx ON public.push_tokens(is_active);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS push_tokens_updated_at ON public.push_tokens;
CREATE TRIGGER push_tokens_updated_at BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP POLICY IF EXISTS "Users can manage their own push tokens" ON public.push_tokens;
CREATE POLICY "Users can manage their own push tokens"
  ON public.push_tokens FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Trip members can view recipient push tokens" ON public.push_tokens;
CREATE POLICY "Trip members can view recipient push tokens"
  ON public.push_tokens FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.trip_members viewer
      JOIN public.trip_members recipient ON recipient.trip_id = viewer.trip_id
      WHERE viewer.user_id = auth.uid()
        AND recipient.user_id = public.push_tokens.user_id
    )
  );

NOTIFY pgrst, 'reload schema';
