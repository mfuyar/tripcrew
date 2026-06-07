-- Person-level expense splits for trips before families exist, or for
-- expenses that apply to specific people instead of families.

CREATE TABLE IF NOT EXISTS public.expense_person_splits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id    UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  trip_id       UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  share_amount  NUMERIC(12,2) NOT NULL,
  percentage    NUMERIC(5,2),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (expense_id, user_id)
);

CREATE INDEX IF NOT EXISTS expense_person_splits_expense_id_idx
  ON public.expense_person_splits(expense_id);
CREATE INDEX IF NOT EXISTS expense_person_splits_trip_id_idx
  ON public.expense_person_splits(trip_id);
CREATE INDEX IF NOT EXISTS expense_person_splits_user_id_idx
  ON public.expense_person_splits(user_id);

ALTER TABLE public.expense_person_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Expense roles can view person splits" ON public.expense_person_splits;
CREATE POLICY "Expense roles can view person splits"
  ON public.expense_person_splits FOR SELECT
  USING (public.can_view_trip_expenses(trip_id, auth.uid()));

DROP POLICY IF EXISTS "Expense managers can insert person splits" ON public.expense_person_splits;
CREATE POLICY "Expense managers can insert person splits"
  ON public.expense_person_splits FOR INSERT
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

DROP POLICY IF EXISTS "Expense managers can update person splits" ON public.expense_person_splits;
CREATE POLICY "Expense managers can update person splits"
  ON public.expense_person_splits FOR UPDATE
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

DROP POLICY IF EXISTS "Expense managers can delete person splits" ON public.expense_person_splits;
CREATE POLICY "Expense managers can delete person splits"
  ON public.expense_person_splits FOR DELETE
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
    public.can_manage_trip(trip_uuid, auth.uid())
    OR expense_payer = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only trip admins, organizers, or the expense payer can modify person splits';
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

GRANT EXECUTE ON FUNCTION public.replace_expense_person_splits(UUID, UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
