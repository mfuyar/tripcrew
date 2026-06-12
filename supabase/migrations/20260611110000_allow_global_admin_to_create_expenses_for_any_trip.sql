-- Global admins can manage any trip's content — can_view_trip_expenses() and
-- can_manage_trip() both already return true for them. But the expense INSERT
-- policy from 20260607184000_person_expenses_without_families.sql also requires
-- is_trip_member(trip_id, paid_by_user_id), and paid_by_user_id is always the
-- creator's own auth.uid(). A global admin managing a trip they don't belong to
-- fails that check, so "Add Expense" raises an RLS violation for them. Add the
-- same is_global_admin() bypass the other helper functions already have.

DROP POLICY IF EXISTS "Expense roles can create expenses" ON public.expenses;
CREATE POLICY "Expense roles can create expenses"
  ON public.expenses FOR INSERT
  WITH CHECK (
    public.can_view_trip_expenses(trip_id, auth.uid())
    AND (
      paid_by_user_id = auth.uid()
      OR public.can_manage_trip(trip_id, auth.uid())
    )
    AND (
      public.is_trip_member(trip_id, paid_by_user_id)
      OR public.is_global_admin(auth.uid())
    )
    AND (
      paid_by_family_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.families f
        WHERE f.id = paid_by_family_id
          AND f.trip_id = expenses.trip_id
      )
    )
  );

NOTIFY pgrst, 'reload schema';
