-- Trip admins can add expenses, but should not be able to edit or delete
-- expenses that other admins created — only the trip organizer (or a global
-- admin) and the expense's own payer/creator can modify or remove it.
--
-- can_manage_trip() is intentionally left untouched (it still grants both
-- trip_organizer and trip_admin broad management rights elsewhere — content
-- moderation, member roles, families, etc.). This adds a narrower helper
-- scoped to expense edit/delete only.

CREATE OR REPLACE FUNCTION public.can_edit_trip_expenses(trip_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT
    public.is_global_admin(user_uuid)
    OR EXISTS (
      SELECT 1 FROM public.trip_members
      WHERE trip_id = trip_uuid AND user_id = user_uuid AND role = 'trip_organizer'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.can_edit_trip_expenses(UUID, UUID) TO authenticated;

-- Expenses
DROP POLICY IF EXISTS "Expense creators and organizers can update expenses" ON public.expenses;
CREATE POLICY "Expense creators and organizers can update expenses"
  ON public.expenses FOR UPDATE
  USING (
    paid_by_user_id = auth.uid()
    OR public.can_edit_trip_expenses(trip_id, auth.uid())
  );

DROP POLICY IF EXISTS "Expense creators and organizers can delete expenses" ON public.expenses;
CREATE POLICY "Expense creators and organizers can delete expenses"
  ON public.expenses FOR DELETE
  USING (
    paid_by_user_id = auth.uid()
    OR public.can_edit_trip_expenses(trip_id, auth.uid())
  );

-- Expense (family) splits
DROP POLICY IF EXISTS "Expense managers can insert splits" ON public.expense_splits;
CREATE POLICY "Expense managers can insert splits"
  ON public.expense_splits FOR INSERT
  WITH CHECK (
    public.can_edit_trip_expenses(trip_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_id AND e.trip_id = trip_id AND e.paid_by_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Expense managers can update splits" ON public.expense_splits;
CREATE POLICY "Expense managers can update splits"
  ON public.expense_splits FOR UPDATE
  USING (
    public.can_edit_trip_expenses(trip_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_id AND e.trip_id = trip_id AND e.paid_by_user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.can_edit_trip_expenses(trip_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_id AND e.trip_id = trip_id AND e.paid_by_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Expense managers can delete splits" ON public.expense_splits;
CREATE POLICY "Expense managers can delete splits"
  ON public.expense_splits FOR DELETE
  USING (
    public.can_edit_trip_expenses(trip_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_id AND e.trip_id = trip_id AND e.paid_by_user_id = auth.uid()
    )
  );

-- Expense person splits
DROP POLICY IF EXISTS "Expense managers can insert person splits" ON public.expense_person_splits;
CREATE POLICY "Expense managers can insert person splits"
  ON public.expense_person_splits FOR INSERT
  WITH CHECK (
    public.can_edit_trip_expenses(trip_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_id AND e.trip_id = trip_id AND e.paid_by_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Expense managers can update person splits" ON public.expense_person_splits;
CREATE POLICY "Expense managers can update person splits"
  ON public.expense_person_splits FOR UPDATE
  USING (
    public.can_edit_trip_expenses(trip_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_id AND e.trip_id = trip_id AND e.paid_by_user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.can_edit_trip_expenses(trip_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_id AND e.trip_id = trip_id AND e.paid_by_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Expense managers can delete person splits" ON public.expense_person_splits;
CREATE POLICY "Expense managers can delete person splits"
  ON public.expense_person_splits FOR DELETE
  USING (
    public.can_edit_trip_expenses(trip_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_id AND e.trip_id = trip_id AND e.paid_by_user_id = auth.uid()
    )
  );

-- RPCs used by expenseService.saveExpenseSplits / saveExpensePersonSplits
CREATE OR REPLACE FUNCTION public.replace_expense_splits(
  expense_uuid UUID,
  trip_uuid    UUID,
  shares_json  JSONB
)
RETURNS SETOF public.expense_splits AS $$
DECLARE
  expense_total  NUMERIC;
  split_total    NUMERIC;
  expense_payer  UUID;
BEGIN
  SELECT amount, paid_by_user_id
  INTO expense_total, expense_payer
  FROM public.expenses
  WHERE id = expense_uuid AND trip_id = trip_uuid;

  IF expense_total IS NULL THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  IF NOT (
    public.can_edit_trip_expenses(trip_uuid, auth.uid())
    OR expense_payer = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the trip organizer or the expense payer can modify splits';
  END IF;

  IF jsonb_array_length(shares_json) = 0 THEN
    RAISE EXCEPTION 'Expense must have at least one split';
  END IF;

  SELECT COALESCE(SUM((share_item->>'share_amount')::NUMERIC), 0)
  INTO split_total
  FROM jsonb_array_elements(shares_json) AS share_item;

  IF ABS(split_total - expense_total) > 0.01 THEN
    RAISE EXCEPTION 'Expense splits must sum to expense amount (±0.01)';
  END IF;

  DELETE FROM public.expense_splits WHERE expense_id = expense_uuid;

  RETURN QUERY
  INSERT INTO public.expense_splits (expense_id, trip_id, family_id, share_amount, percentage)
  SELECT
    expense_uuid,
    trip_uuid,
    (share_item->>'family_id')::UUID,
    (share_item->>'share_amount')::NUMERIC,
    NULLIF(share_item->>'percentage', '')::NUMERIC
  FROM jsonb_array_elements(shares_json) AS share_item
  RETURNING *;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.replace_expense_person_splits(
  expense_uuid UUID,
  trip_uuid UUID,
  shares_json JSONB
)
RETURNS SETOF public.expense_person_splits AS $$
DECLARE
  expense_total NUMERIC;
  expense_payer UUID;
  split_total NUMERIC;
BEGIN
  SELECT amount, paid_by_user_id
  INTO expense_total, expense_payer
  FROM public.expenses
  WHERE id = expense_uuid AND trip_id = trip_uuid;

  IF expense_total IS NULL THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  IF NOT (
    public.can_edit_trip_expenses(trip_uuid, auth.uid())
    OR expense_payer = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the trip organizer or the expense payer can modify person splits';
  END IF;

  IF jsonb_array_length(shares_json) = 0 THEN
    RAISE EXCEPTION 'Expense must have at least one person split';
  END IF;

  SELECT COALESCE(SUM((share_item->>'share_amount')::NUMERIC), 0)
  INTO split_total
  FROM jsonb_array_elements(shares_json) AS share_item;

  IF ABS(split_total - expense_total) > 0.01 THEN
    RAISE EXCEPTION 'Person splits must sum to expense amount (±0.01)';
  END IF;

  DELETE FROM public.expense_person_splits WHERE expense_id = expense_uuid;

  RETURN QUERY
  INSERT INTO public.expense_person_splits (expense_id, trip_id, user_id, share_amount, percentage)
  SELECT
    expense_uuid,
    trip_uuid,
    (share_item->>'user_id')::UUID,
    (share_item->>'share_amount')::NUMERIC,
    NULLIF(share_item->>'percentage', '')::NUMERIC
  FROM jsonb_array_elements(shares_json) AS share_item
  RETURNING *;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.replace_expense_splits(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_expense_person_splits(UUID, UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
