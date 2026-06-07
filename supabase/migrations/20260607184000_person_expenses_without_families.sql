-- Allow organizers/admins to record startup expenses before families exist.
-- In that case the payer is a trip member and paid_by_family_id stays null.

ALTER TABLE public.expenses
  ALTER COLUMN paid_by_family_id DROP NOT NULL;

DROP POLICY IF EXISTS "Admins can create expenses" ON public.expenses;
CREATE POLICY "Expense roles can create expenses"
  ON public.expenses FOR INSERT
  WITH CHECK (
    public.can_view_trip_expenses(trip_id, auth.uid())
    AND (
      paid_by_user_id = auth.uid()
      OR public.can_manage_trip(trip_id, auth.uid())
    )
    AND public.is_trip_member(trip_id, paid_by_user_id)
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
