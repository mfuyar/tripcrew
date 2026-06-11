-- can_act_on_settlement (created by 20260607213000 / redefined by 20260607214000) is
-- SECURITY DEFINER and was missed by 20260610110000's RPC-grant hardening pass.
-- The current settlements policies (from 20260607215000) use is_trip_organizer /
-- can_confirm_settlement instead — can_act_on_settlement is unreferenced by any
-- policy or function, and unused by the app. Leaving the default PUBLIC grant lets
-- an anonymous caller hit /rest/v1/rpc/can_act_on_settlement with arbitrary trip,
-- family, and user IDs and learn whether that user can act on settlements there.
REVOKE EXECUTE ON FUNCTION public.can_act_on_settlement(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
