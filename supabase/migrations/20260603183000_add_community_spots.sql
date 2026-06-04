CREATE TABLE IF NOT EXISTS public.community_spots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'other'
                    CHECK (category IN ('outdoor','food','culture','hidden_gem','other')),
  description     TEXT NOT NULL,
  address         TEXT,
  latitude        DOUBLE PRECISION NOT NULL,
  longitude       DOUBLE PRECISION NOT NULL,
  photo_url       TEXT,
  upvotes_count   INTEGER NOT NULL DEFAULT 0 CHECK (upvotes_count >= 0),
  comments_count  INTEGER NOT NULL DEFAULT 0 CHECK (comments_count >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS community_spots_created_at_idx ON public.community_spots(created_at);
CREATE INDEX IF NOT EXISTS community_spots_lat_lng_idx ON public.community_spots(latitude, longitude);
DROP TRIGGER IF EXISTS community_spots_updated_at ON public.community_spots;
CREATE TRIGGER community_spots_updated_at BEFORE UPDATE ON public.community_spots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.community_spot_comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  spot_id     UUID NOT NULL REFERENCES public.community_spots(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS community_spot_comments_spot_id_idx ON public.community_spot_comments(spot_id);

CREATE TABLE IF NOT EXISTS public.community_spot_votes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  spot_id     UUID NOT NULL REFERENCES public.community_spots(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (spot_id, user_id)
);
CREATE INDEX IF NOT EXISTS community_spot_votes_spot_id_idx ON public.community_spot_votes(spot_id);

CREATE OR REPLACE FUNCTION public.update_community_spot_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_spots
    SET comments_count = comments_count + 1
    WHERE id = NEW.spot_id;
    RETURN NEW;
  END IF;

  UPDATE public.community_spots
  SET comments_count = GREATEST(comments_count - 1, 0)
  WHERE id = OLD.spot_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS community_spot_comment_count ON public.community_spot_comments;
CREATE TRIGGER community_spot_comment_count
  AFTER INSERT OR DELETE ON public.community_spot_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_community_spot_comment_count();

CREATE OR REPLACE FUNCTION public.toggle_community_spot_vote(p_spot_id UUID, p_user_id UUID)
RETURNS public.community_spots AS $$
DECLARE
  result public.community_spots;
BEGIN
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot vote for another user';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_spot_id::text || ':' || p_user_id::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.community_spot_votes
    WHERE spot_id = p_spot_id AND user_id = p_user_id
  ) THEN
    DELETE FROM public.community_spot_votes
    WHERE spot_id = p_spot_id AND user_id = p_user_id;

    UPDATE public.community_spots
    SET upvotes_count = GREATEST(upvotes_count - 1, 0)
    WHERE id = p_spot_id
    RETURNING * INTO result;
  ELSE
    INSERT INTO public.community_spot_votes (spot_id, user_id)
    VALUES (p_spot_id, p_user_id);

    UPDATE public.community_spots
    SET upvotes_count = upvotes_count + 1
    WHERE id = p_spot_id
    RETURNING * INTO result;
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_nearby_community_spots(
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION,
  p_radius_miles DOUBLE PRECISION DEFAULT 10,
  p_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  name TEXT,
  category TEXT,
  description TEXT,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  photo_url TEXT,
  upvotes_count INTEGER,
  comments_count INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  distance_miles DOUBLE PRECISION,
  viewer_has_upvoted BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.user_id,
    s.name,
    s.category,
    s.description,
    s.address,
    s.latitude,
    s.longitude,
    s.photo_url,
    s.upvotes_count,
    s.comments_count,
    s.created_at,
    s.updated_at,
    (
      3958.7613 * acos(
        LEAST(1, GREATEST(-1,
          cos(radians(p_latitude))
          * cos(radians(s.latitude))
          * cos(radians(s.longitude) - radians(p_longitude))
          + sin(radians(p_latitude))
          * sin(radians(s.latitude))
        ))
      )
    ) AS distance_miles,
    EXISTS (
      SELECT 1 FROM public.community_spot_votes v
      WHERE v.spot_id = s.id AND v.user_id = p_user_id
    ) AS viewer_has_upvoted
  FROM public.community_spots s
  WHERE (
    3958.7613 * acos(
      LEAST(1, GREATEST(-1,
        cos(radians(p_latitude))
        * cos(radians(s.latitude))
        * cos(radians(s.longitude) - radians(p_longitude))
        + sin(radians(p_latitude))
        * sin(radians(s.latitude))
      ))
    )
  ) <= p_radius_miles
  ORDER BY distance_miles ASC, s.upvotes_count DESC, s.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.toggle_community_spot_vote(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_nearby_community_spots(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, UUID, INTEGER) TO authenticated;

ALTER TABLE public.community_spots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view community spots" ON public.community_spots;
CREATE POLICY "Authenticated users can view community spots"
  ON public.community_spots FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can create their own community spots" ON public.community_spots;
CREATE POLICY "Users can create their own community spots"
  ON public.community_spots FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own community spots" ON public.community_spots;
CREATE POLICY "Users can update their own community spots"
  ON public.community_spots FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own community spots" ON public.community_spots;
CREATE POLICY "Users can delete their own community spots"
  ON public.community_spots FOR DELETE
  USING (user_id = auth.uid());

ALTER TABLE public.community_spot_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view community spot comments" ON public.community_spot_comments;
CREATE POLICY "Authenticated users can view community spot comments"
  ON public.community_spot_comments FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can create their own community spot comments" ON public.community_spot_comments;
CREATE POLICY "Users can create their own community spot comments"
  ON public.community_spot_comments FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own community spot comments" ON public.community_spot_comments;
CREATE POLICY "Users can delete their own community spot comments"
  ON public.community_spot_comments FOR DELETE
  USING (user_id = auth.uid());

ALTER TABLE public.community_spot_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view community spot votes" ON public.community_spot_votes;
CREATE POLICY "Authenticated users can view community spot votes"
  ON public.community_spot_votes FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can manage their own community spot votes" ON public.community_spot_votes;
CREATE POLICY "Users can manage their own community spot votes"
  ON public.community_spot_votes FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
