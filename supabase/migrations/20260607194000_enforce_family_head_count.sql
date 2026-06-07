-- Enforce family head count as the maximum number of linked family members.

CREATE OR REPLACE FUNCTION public.family_member_capacity(p_family_id UUID)
RETURNS INTEGER AS $$
  SELECT COALESCE(f.adults_count, 0) + COALESCE(f.children_count, 0)
  FROM public.families f
  WHERE f.id = p_family_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.enforce_family_member_capacity()
RETURNS TRIGGER AS $$
DECLARE
  capacity INTEGER;
  current_count INTEGER;
BEGIN
  SELECT public.family_member_capacity(NEW.family_id) INTO capacity;
  IF capacity IS NULL THEN
    RAISE EXCEPTION 'Family not found';
  END IF;

  SELECT COUNT(*) INTO current_count
  FROM public.family_members fm
  WHERE fm.family_id = NEW.family_id
    AND fm.user_id <> NEW.user_id;

  IF current_count >= capacity THEN
    RAISE EXCEPTION 'This family is already at its defined head count. Increase the head count in the family first, then add another member.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_family_member_capacity ON public.family_members;
CREATE TRIGGER enforce_family_member_capacity
  BEFORE INSERT OR UPDATE OF family_id, user_id ON public.family_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_family_member_capacity();

CREATE OR REPLACE FUNCTION public.enforce_family_head_count_not_below_members()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
  next_capacity INTEGER;
BEGIN
  next_capacity := COALESCE(NEW.adults_count, 0) + COALESCE(NEW.children_count, 0);

  SELECT COUNT(*) INTO current_count
  FROM public.family_members fm
  WHERE fm.family_id = NEW.id;

  IF current_count > next_capacity THEN
    RAISE EXCEPTION 'This family already has more members than the new head count. Remove members or increase the head count first.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_family_head_count_not_below_members ON public.families;
CREATE TRIGGER enforce_family_head_count_not_below_members
  BEFORE UPDATE OF adults_count, children_count ON public.families
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_family_head_count_not_below_members();

NOTIFY pgrst, 'reload schema';
