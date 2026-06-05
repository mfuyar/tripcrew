-- ─── Security fixes: M-1, L-3 ────────────────────────────────────────────────

-- M-1: replace_expense_splits with explicit admin check (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.replace_expense_splits(
  expense_uuid UUID,
  trip_uuid    UUID,
  shares_json  JSONB
)
RETURNS SETOF public.expense_splits AS $$
DECLARE
  expense_total NUMERIC;
  split_total   NUMERIC;
BEGIN
  IF NOT public.can_manage_trip(trip_uuid, auth.uid()) THEN
    RAISE EXCEPTION 'Only trip admins and organizers can modify expense splits';
  END IF;

  IF jsonb_array_length(shares_json) = 0 THEN
    RAISE EXCEPTION 'Expense must have at least one split';
  END IF;

  SELECT amount INTO expense_total
  FROM public.expenses
  WHERE id = expense_uuid AND trip_id = trip_uuid;

  IF expense_total IS NULL THEN
    RAISE EXCEPTION 'Expense not found';
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

-- L-3: allow requesters to delete their own cancelled requests
DROP POLICY IF EXISTS "Users can delete their own cancelled requests" ON public.trip_join_requests;
CREATE POLICY "Users can delete their own cancelled requests"
  ON public.trip_join_requests FOR DELETE
  USING (user_id = auth.uid() AND status = 'cancelled');
