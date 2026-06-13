-- Let trips show a themed emoji (beach, mountain, snow, city, etc.) chosen
-- by the organizer instead of the hardcoded 🏖️ shown everywhere.

ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS cover_emoji TEXT NOT NULL DEFAULT '🏖️';

NOTIFY pgrst, 'reload schema';
