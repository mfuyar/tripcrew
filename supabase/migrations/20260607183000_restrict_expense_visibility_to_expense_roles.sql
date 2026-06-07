-- Match expense data visibility to the app UI:
-- regular trip members can be in the trip, chat, and join/create families,
-- but only trip organizers, trip admins, family admins, and global admins
-- can read expense/balance/settlement data.

CREATE OR REPLACE FUNCTION public.can_view_trip_expenses(trip_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT
    public.can_manage_trip(trip_uuid, user_uuid)
    OR EXISTS (
      SELECT 1
      FROM public.trip_members tm
      WHERE tm.trip_id = trip_uuid
        AND tm.user_id = user_uuid
        AND tm.role = 'family_admin'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.can_view_trip_expenses(UUID, UUID) TO authenticated;

-- Expenses
DROP POLICY IF EXISTS "Trip members can view expenses" ON public.expenses;
DROP POLICY IF EXISTS "Global admin can view all expenses" ON public.expenses;
DROP POLICY IF EXISTS "Global admin can view expenses with consent" ON public.expenses;
CREATE POLICY "Expense roles can view expenses"
  ON public.expenses FOR SELECT
  USING (
    public.can_view_trip_expenses(trip_id, auth.uid())
    AND (
      is_deleted = false
      OR public.can_manage_trip(trip_id, auth.uid())
    )
  );

-- Expense splits reveal amounts and balances, so keep them behind the same
-- read gate. Direct writes remain limited to trip managers or the expense payer.
DROP POLICY IF EXISTS "Trip members can view splits" ON public.expense_splits;
DROP POLICY IF EXISTS "Trip members can manage splits" ON public.expense_splits;
DROP POLICY IF EXISTS "Global admin can view all expense splits" ON public.expense_splits;
DROP POLICY IF EXISTS "Global admin can view expense splits with consent" ON public.expense_splits;
CREATE POLICY "Expense roles can view splits"
  ON public.expense_splits FOR SELECT
  USING (public.can_view_trip_expenses(trip_id, auth.uid()));

CREATE POLICY "Expense managers can insert splits"
  ON public.expense_splits FOR INSERT
  WITH CHECK (
    public.can_manage_trip(trip_id, auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.expenses e
      WHERE e.id = expense_id
        AND e.trip_id = trip_id
        AND e.paid_by_user_id = auth.uid()
    )
  );

CREATE POLICY "Expense managers can update splits"
  ON public.expense_splits FOR UPDATE
  USING (
    public.can_manage_trip(trip_id, auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.expenses e
      WHERE e.id = expense_id
        AND e.trip_id = trip_id
        AND e.paid_by_user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.can_manage_trip(trip_id, auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.expenses e
      WHERE e.id = expense_id
        AND e.trip_id = trip_id
        AND e.paid_by_user_id = auth.uid()
    )
  );

CREATE POLICY "Expense managers can delete splits"
  ON public.expense_splits FOR DELETE
  USING (
    public.can_manage_trip(trip_id, auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.expenses e
      WHERE e.id = expense_id
        AND e.trip_id = trip_id
        AND e.paid_by_user_id = auth.uid()
    )
  );

-- Settlements are derived from expenses, so regular members should not be able
-- to read them directly either.
DROP POLICY IF EXISTS "Trip members can view settlements" ON public.settlements;
DROP POLICY IF EXISTS "Global admin can view all settlements" ON public.settlements;
DROP POLICY IF EXISTS "Global admin can view settlements with consent" ON public.settlements;
CREATE POLICY "Expense roles can view settlements"
  ON public.settlements FOR SELECT
  USING (public.can_view_trip_expenses(trip_id, auth.uid()));

-- Expense history can contain old amounts/notes/receipts. Keep its read policy
-- aligned with current expense visibility.
DROP POLICY IF EXISTS "Admins can view all versions" ON public.expense_versions;
CREATE POLICY "Expense roles can view versions"
  ON public.expense_versions FOR SELECT
  USING (
    public.can_view_trip_expenses(trip_id, auth.uid())
    AND (
      public.can_manage_trip(trip_id, auth.uid())
      OR version_number = (
        SELECT e.current_version
        FROM public.expenses e
        WHERE e.id = expense_id
      )
    )
  );

NOTIFY pgrst, 'reload schema';
