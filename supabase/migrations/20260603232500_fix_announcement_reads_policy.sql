DROP POLICY IF EXISTS "Users can manage their own reads" ON public.announcement_reads;

CREATE POLICY "Users can manage their own reads"
  ON public.announcement_reads FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
