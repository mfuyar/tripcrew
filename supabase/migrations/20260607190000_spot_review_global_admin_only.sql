-- Community spot review is restricted to global admins only.
-- The old app_moderators table can remain for history, but it no longer grants
-- moderation access.

CREATE OR REPLACE FUNCTION public.is_app_moderator(user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT public.is_global_admin(user_uuid);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

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

  IF NOT public.is_global_admin(p_moderator_id) THEN
    RAISE EXCEPTION 'Only global admins can review community spots';
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

DROP POLICY IF EXISTS "Authenticated users can view community spots" ON public.community_spots;
CREATE POLICY "Authenticated users can view community spots"
  ON public.community_spots FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      moderation_status = 'approved'
      OR user_id = auth.uid()
      OR public.is_global_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users and moderators can update community spots" ON public.community_spots;
CREATE POLICY "Users and global admins can update community spots"
  ON public.community_spots FOR UPDATE
  USING (user_id = auth.uid() OR public.is_global_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_global_admin(auth.uid()));

DROP POLICY IF EXISTS "Users and moderators can delete community spots" ON public.community_spots;
CREATE POLICY "Users and global admins can delete community spots"
  ON public.community_spots FOR DELETE
  USING (user_id = auth.uid() OR public.is_global_admin(auth.uid()));

GRANT EXECUTE ON FUNCTION public.is_app_moderator(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_community_spot(UUID, UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
