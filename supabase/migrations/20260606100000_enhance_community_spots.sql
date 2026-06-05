-- ─── Enhanced Community Spots ─────────────────────────────────────────────────

-- Expand category check constraint
ALTER TABLE public.community_spots
  DROP CONSTRAINT IF EXISTS community_spots_category_check;

ALTER TABLE public.community_spots
  ADD CONSTRAINT community_spots_category_check
    CHECK (category IN (
      'attraction','park','museum','food','shopping','religious',
      'family','free','indoor','hidden_gem','outdoor','other'
    ));

-- New columns
ALTER TABLE public.community_spots
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'member'
    CHECK (source_type IN ('api','member','gemini')),
  ADD COLUMN IF NOT EXISTS source_name TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS osm_id TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS opening_hours TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS why_recommended TEXT,
  ADD COLUMN IF NOT EXISTS priority_score NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distance_km NUMERIC,
  ADD COLUMN IF NOT EXISTS distance_unit TEXT DEFAULT 'miles',
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_source TEXT,
  ADD COLUMN IF NOT EXISTS submitted_by_name TEXT,
  ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saves_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS matched_preferences TEXT[] DEFAULT '{}';

-- Prevent duplicate OSM places per trip
CREATE UNIQUE INDEX IF NOT EXISTS community_spots_osm_trip_idx
  ON public.community_spots(trip_id, osm_id)
  WHERE osm_id IS NOT NULL;

-- Likes table
CREATE TABLE IF NOT EXISTS public.community_spot_likes (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id UUID NOT NULL REFERENCES public.community_spots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (spot_id, user_id)
);
ALTER TABLE public.community_spot_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view likes"
  ON public.community_spot_likes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can manage their own likes"
  ON public.community_spot_likes FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Saves table
CREATE TABLE IF NOT EXISTS public.community_spot_saves (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id UUID NOT NULL REFERENCES public.community_spots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (spot_id, user_id)
);
ALTER TABLE public.community_spot_saves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view saves"
  ON public.community_spot_saves FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can manage their own saves"
  ON public.community_spot_saves FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Triggers for likes/saves count
CREATE OR REPLACE FUNCTION public.update_spot_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_spots SET likes_count = likes_count + 1 WHERE id = NEW.spot_id;
    RETURN NEW;
  END IF;
  UPDATE public.community_spots SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.spot_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_spot_saves_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_spots SET saves_count = saves_count + 1 WHERE id = NEW.spot_id;
    RETURN NEW;
  END IF;
  UPDATE public.community_spots SET saves_count = GREATEST(saves_count - 1, 0) WHERE id = OLD.spot_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS spot_likes_count ON public.community_spot_likes;
CREATE TRIGGER spot_likes_count
  AFTER INSERT OR DELETE ON public.community_spot_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_spot_likes_count();

DROP TRIGGER IF EXISTS spot_saves_count ON public.community_spot_saves;
CREATE TRIGGER spot_saves_count
  AFTER INSERT OR DELETE ON public.community_spot_saves
  FOR EACH ROW EXECUTE FUNCTION public.update_spot_saves_count();

GRANT EXECUTE ON FUNCTION public.update_spot_likes_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_spot_saves_count() TO authenticated;
