-- Person-to-person expenses can be edited or soft-deleted by anyone involved
-- in that specific person split: the payer, a listed split participant, the
-- trip organizer, or a global admin. Other trip admins remain blocked.

CREATE OR REPLACE FUNCTION public.is_trip_organizer(trip_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trip_members
    WHERE trip_id = trip_uuid
      AND user_id = user_uuid
      AND role = 'trip_organizer'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.is_trip_organizer(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_edit_expense(expense_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expenses e
    WHERE e.id = expense_uuid
      AND (
        public.is_global_admin(user_uuid)
        OR public.is_trip_organizer(e.trip_id, user_uuid)
        OR e.paid_by_user_id = user_uuid
        OR (
          e.paid_by_family_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.expense_person_splits eps
            WHERE eps.expense_id = e.id
              AND eps.trip_id = e.trip_id
              AND eps.user_id = user_uuid
          )
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.can_edit_expense(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_view_expense(expense_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  WITH expense_scope AS (
    SELECT
      e.*,
      (
        e.paid_by_family_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.expense_splits es
          WHERE es.expense_id = e.id AND es.share_amount > 0
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.expense_splits es
          WHERE es.expense_id = e.id
            AND es.share_amount > 0
            AND es.family_id <> e.paid_by_family_id
        )
      ) AS is_self_family_expense,
      (
        e.paid_by_family_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.expense_person_splits eps
          WHERE eps.expense_id = e.id AND eps.share_amount > 0
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.expense_person_splits eps
          WHERE eps.expense_id = e.id
            AND eps.share_amount > 0
            AND eps.user_id <> e.paid_by_user_id
        )
      ) AS is_self_person_expense
    FROM public.expenses e
    WHERE e.id = expense_uuid
  )
  SELECT EXISTS (
    SELECT 1
    FROM expense_scope e
    WHERE
      public.is_global_admin(user_uuid)
      OR public.is_trip_organizer(e.trip_id, user_uuid)
      OR (
        e.is_self_family_expense
        AND EXISTS (
          SELECT 1
          FROM public.family_members fm
          WHERE fm.family_id = e.paid_by_family_id
            AND fm.user_id = user_uuid
        )
      )
      OR (
        e.is_self_person_expense
        AND e.paid_by_user_id = user_uuid
      )
      OR (
        NOT e.is_self_family_expense
        AND NOT e.is_self_person_expense
        AND (
          public.can_view_trip_expenses(e.trip_id, user_uuid)
          OR e.paid_by_user_id = user_uuid
          OR (
            e.paid_by_family_id IS NULL
            AND EXISTS (
              SELECT 1
              FROM public.expense_person_splits eps
              WHERE eps.expense_id = e.id
                AND eps.trip_id = e.trip_id
                AND eps.user_id = user_uuid
            )
          )
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.can_view_expense(UUID, UUID) TO authenticated;

-- Expenses
DROP POLICY IF EXISTS "Expense roles can view expenses" ON public.expenses;
CREATE POLICY "Expense roles can view expenses"
  ON public.expenses FOR SELECT
  USING (
    public.can_view_expense(id, auth.uid())
    AND (
      is_deleted = false
      OR public.can_manage_trip(trip_id, auth.uid())
      OR public.is_global_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Expense creators and organizers can update expenses" ON public.expenses;
CREATE POLICY "Expense creators and organizers can update expenses"
  ON public.expenses FOR UPDATE
  USING (public.can_edit_expense(id, auth.uid()))
  WITH CHECK (public.can_edit_expense(id, auth.uid()));

DROP POLICY IF EXISTS "Expense creators and organizers can delete expenses" ON public.expenses;
CREATE POLICY "Expense creators and organizers can delete expenses"
  ON public.expenses FOR DELETE
  USING (public.can_edit_expense(id, auth.uid()));

DROP POLICY IF EXISTS "Expense roles can view splits" ON public.expense_splits;
CREATE POLICY "Expense roles can view splits"
  ON public.expense_splits FOR SELECT
  USING (public.can_view_expense(expense_id, auth.uid()));

-- Person-split row management. This is mainly for fallback direct table writes;
-- the app normally uses replace_expense_person_splits().
DROP POLICY IF EXISTS "Expense roles can view person splits" ON public.expense_person_splits;
CREATE POLICY "Expense roles can view person splits"
  ON public.expense_person_splits FOR SELECT
  USING (public.can_view_expense(expense_id, auth.uid()));

DROP POLICY IF EXISTS "Expense managers can insert person splits" ON public.expense_person_splits;
CREATE POLICY "Expense managers can insert person splits"
  ON public.expense_person_splits FOR INSERT
  WITH CHECK (public.can_edit_expense(expense_id, auth.uid()));

DROP POLICY IF EXISTS "Expense managers can update person splits" ON public.expense_person_splits;
CREATE POLICY "Expense managers can update person splits"
  ON public.expense_person_splits FOR UPDATE
  USING (public.can_edit_expense(expense_id, auth.uid()))
  WITH CHECK (public.can_edit_expense(expense_id, auth.uid()));

DROP POLICY IF EXISTS "Expense managers can delete person splits" ON public.expense_person_splits;
CREATE POLICY "Expense managers can delete person splits"
  ON public.expense_person_splits FOR DELETE
  USING (public.can_edit_expense(expense_id, auth.uid()));

DROP POLICY IF EXISTS "Expense roles can view versions" ON public.expense_versions;
CREATE POLICY "Expense roles can view versions"
  ON public.expense_versions FOR SELECT
  USING (
    public.can_view_expense(expense_id, auth.uid())
    AND (
      public.can_manage_trip(trip_id, auth.uid())
      OR public.is_global_admin(auth.uid())
      OR version_number = (
        SELECT e.current_version
        FROM public.expenses e
        WHERE e.id = expense_id
      )
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
  split_total NUMERIC;
BEGIN
  SELECT amount
  INTO expense_total
  FROM public.expenses
  WHERE id = expense_uuid AND trip_id = trip_uuid;

  IF expense_total IS NULL THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  IF NOT public.can_edit_expense(expense_uuid, auth.uid()) THEN
    RAISE EXCEPTION 'Only involved people or the trip organizer can modify person splits';
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.replace_expense_person_splits(UUID, UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
