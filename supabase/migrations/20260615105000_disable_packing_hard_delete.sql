-- Packing items should be soft-deleted so audit history remains available.
-- Do not allow authenticated clients to hard-delete packing item rows.

DROP POLICY IF EXISTS "Creators family admins and trip admins can delete packing items" ON public.packing_items;
DROP POLICY IF EXISTS "Creators and organizers can delete packing items" ON public.packing_items;
DROP POLICY IF EXISTS "Trip members can manage packing items" ON public.packing_items;

NOTIFY pgrst, 'reload schema';
