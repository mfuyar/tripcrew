-- Comma-separated packing entry creates separate checklist rows, but those
-- rows should stay visually grouped as the batch the user added.

ALTER TABLE public.packing_items
  ADD COLUMN IF NOT EXISTS group_id TEXT;

CREATE INDEX IF NOT EXISTS packing_items_group_id_idx
  ON public.packing_items(group_id)
  WHERE group_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
