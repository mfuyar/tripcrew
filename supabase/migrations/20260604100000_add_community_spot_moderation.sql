-- Community spot moderation and privacy
-- Add your owner/moderator email after running this migration:
-- INSERT INTO public.app_moderators (email) VALUES ('you@example.com')
-- ON CONFLICT (email) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.app_moderators (
  email       TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_moderators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Moderators can view moderators" ON public.app_moderators;
CREATE POLICY "Moderators can view moderators"
  ON public.app_moderators FOR SELECT
  USING (
    lower(email) = lower(auth.jwt() ->> 'email')
    OR EXISTS (
      SELECT 1 FROM public.app_moderators m
      WHERE lower(m.email) = lower(auth.jwt() ->> 'email')
    )
  );

CREATE OR REPLACE FUNCTION public.is_app_moderator(user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.app_moderators m ON lower(m.email) = lower(p.email)
    WHERE p.id = user_uuid
  )
  OR EXISTS (
    SELECT 1
    FROM public.app_moderators m
    WHERE lower(m.email) = lower(auth.jwt() ->> 'email')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

ALTER TABLE public.community_spots
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (moderation_status IN ('approved', 'pending_review', 'rejected')),
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS community_spots_moderation_status_idx
  ON public.community_spots(moderation_status, created_at);

CREATE OR REPLACE FUNCTION public.review_community_spot(
  p_spot_id UUID,
  p_moderator_id UUID,
  p_status TEXT
)
RETURNS public.community_spots AS $$
DECLARE
  result public.community_spots;
BEGIN
  IF p_moderator_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot review as another user';
  END IF;

  IF NOT public.is_app_moderator(p_moderator_id) THEN
    RAISE EXCEPTION 'Only app moderators can review community spots';
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid moderation status';
  END IF;

  UPDATE public.community_spots
  SET moderation_status = p_status,
      reviewed_by = p_moderator_id,
      reviewed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_spot_id
  RETURNING * INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.is_app_moderator(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_community_spot(UUID, UUID, TEXT) TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can view community spots" ON public.community_spots;
CREATE POLICY "Authenticated users can view community spots"
  ON public.community_spots FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      moderation_status = 'approved'
      OR user_id = auth.uid()
      OR public.is_app_moderator(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update their own community spots" ON public.community_spots;
CREATE POLICY "Users and moderators can update community spots"
  ON public.community_spots FOR UPDATE
  USING (user_id = auth.uid() OR public.is_app_moderator(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_app_moderator(auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own community spots" ON public.community_spots;
CREATE POLICY "Users and moderators can delete community spots"
  ON public.community_spots FOR DELETE
  USING (user_id = auth.uid() OR public.is_app_moderator(auth.uid()));

DROP POLICY IF EXISTS "Users can create their own community spots" ON public.community_spots;
CREATE POLICY "Users can create their own community spots"
  ON public.community_spots FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND moderation_status IN ('approved', 'pending_review')
  );

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
  WHERE s.moderation_status = 'approved'
    AND (
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
