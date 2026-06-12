-- "Delete all" in the Notification Center silently does nothing: RLS on
-- `notifications` (enabled in 20260610100000_enable_rls_on_core_tables.sql)
-- only has SELECT and UPDATE policies. DELETE has no matching policy, so
-- `DELETE FROM notifications WHERE user_id = ...` affects 0 rows with no
-- error — the screen clears its local list optimistically, but the rows
-- come right back on the next load.

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications"
  ON public.notifications FOR DELETE
  USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
