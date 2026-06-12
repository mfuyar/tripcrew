-- Fix "new row violates row-level security policy for table expenses" on
-- INSERT when the client uses .insert(...).select() (i.e. INSERT ... RETURNING).
--
-- The "Expense roles can view expenses" SELECT policy calls
-- can_view_expense(id, auth.uid()), whose body re-queries
-- "FROM public.expenses e WHERE e.id = expense_uuid" to look up the row's
-- own trip_id / paid_by_family_id / paid_by_user_id. During INSERT ...
-- RETURNING, Postgres evaluates this SELECT policy against the just-inserted
-- row as part of the same command — but a command cannot see rows it has
-- itself inserted earlier in that same command, so this self-join returns
-- zero rows, can_view_expense() returns false, and the RETURNING fails with
-- the misleading "violates row-level security policy" error, even though the
-- INSERT policy's own WITH CHECK passed.
--
-- Fix: add an overload of can_view_expense() that takes the row's own
-- trip_id / paid_by_family_id / paid_by_user_id directly (the RLS engine
-- binds these from the new row's column values without re-querying), and
-- point the expenses SELECT policy at it. expense_splits / expense_person_splits
-- / expense_versions policies still use the original 2-arg can_view_expense()
-- for already-committed expense rows, which is unaffected.

CREATE OR REPLACE FUNCTION public.can_view_expense(
  expense_uuid uuid,
  expense_trip_id uuid,
  expense_paid_by_family_id uuid,
  expense_paid_by_user_id uuid,
  user_uuid uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH expense_scope AS (
    SELECT
      expense_trip_id AS trip_id,
      expense_paid_by_family_id AS paid_by_family_id,
      expense_paid_by_user_id AS paid_by_user_id,
      (
        expense_paid_by_family_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.expense_splits es
          WHERE es.expense_id = expense_uuid AND es.share_amount > 0
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.expense_splits es
          WHERE es.expense_id = expense_uuid
            AND es.share_amount > 0
            AND es.family_id <> expense_paid_by_family_id
        )
      ) AS is_self_family_expense,
      (
        expense_paid_by_family_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.expense_person_splits eps
          WHERE eps.expense_id = expense_uuid AND eps.share_amount > 0
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.expense_person_splits eps
          WHERE eps.expense_id = expense_uuid
            AND eps.share_amount > 0
            AND eps.user_id <> expense_paid_by_user_id
        )
      ) AS is_self_person_expense
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
              WHERE eps.expense_id = expense_uuid
                AND eps.trip_id = e.trip_id
                AND eps.user_id = user_uuid
            )
          )
        )
      )
  );
$function$;

DROP POLICY IF EXISTS "Expense roles can view expenses" ON public.expenses;
CREATE POLICY "Expense roles can view expenses"
  ON public.expenses FOR SELECT
  USING (
    public.can_view_expense(id, trip_id, paid_by_family_id, paid_by_user_id, auth.uid())
    AND ((is_deleted = false) OR public.can_manage_trip(trip_id, auth.uid()) OR public.is_global_admin(auth.uid()))
  );

NOTIFY pgrst, 'reload schema';
