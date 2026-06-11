-- ─── WARN-level hardening from the Supabase linter ─────────────────────────
-- Follow-up to 20260610100000 (which fixed the ERROR-level "RLS disabled"
-- findings, confirmed applied — is_trip_member/is_trip_organizer now show
-- search_path=public). This migration addresses the next batch of
-- WARN/SECURITY findings:
--
--   1. function_search_path_mutable — SECURITY DEFINER / trigger functions
--      without `SET search_path`, which is a search_path-hijacking vector
--      (a caller could create objects in a schema earlier in their
--      search_path to shadow tables/functions referenced unqualified inside
--      the function body, and have them run with the function owner's
--      privileges). Verified via pg_proc against the live DB: exactly these
--      11 functions have config_settings = null.
--
--   2. anon_security_definer_function_executable /
--      authenticated_security_definer_function_executable — by default
--      Postgres grants EXECUTE on every new function to PUBLIC, which
--      `anon` inherits. Two classes of function are affected here:
--        a. increment_poll_votes / recalculate_poll_vote_counts:
--           SECURITY DEFINER, no auth checks at all. increment_poll_votes is
--           dead code (superseded by cast_poll_vote, which calls
--           recalculate_poll_vote_counts internally). As-is, an anonymous
--           caller could hit /rest/v1/rpc/increment_poll_votes with any
--           option_id and directly rewrite poll_options.votes_count for any
--           poll on any trip.
--        b. is_trip_member / is_trip_organizer / is_trip_admin /
--           is_global_admin / can_manage_trip / can_manage_announcements /
--           can_view_trip_expenses / can_view_expense / can_edit_expense /
--           can_edit_trip_expenses / can_confirm_settlement /
--           has_admin_consent / is_app_moderator: internal boolean
--           predicates used inside RLS policies (which still need
--           `authenticated` to hold EXECUTE). Leaving the default PUBLIC
--           grant lets an unauthenticated caller hit e.g.
--           /rest/v1/rpc/is_global_admin or /rest/v1/rpc/is_trip_member with
--           arbitrary IDs and learn membership/permission/admin-status info
--           about other users and trips.
--
-- NOTE: auth_leaked_password_protection is a Supabase Auth dashboard toggle
-- (Authentication → Settings → Password Security → "Leaked password
-- protection") and cannot be fixed via SQL migration.

-- ── 1. Pin search_path on the 11 flagged functions ──────────────────────────
ALTER FUNCTION public.can_manage_announcements(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.can_manage_trip(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.increment_poll_votes(uuid) SET search_path = public;
ALTER FUNCTION public.cast_poll_vote(uuid, uuid, uuid, uuid, uuid) SET search_path = public;
ALTER FUNCTION public.is_global_admin(uuid) SET search_path = public;
ALTER FUNCTION public.is_trip_admin(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.recalculate_poll_vote_counts(uuid) SET search_path = public;
ALTER FUNCTION public.update_community_spot_comment_count() SET search_path = public;
ALTER FUNCTION public.update_spot_likes_count() SET search_path = public;
ALTER FUNCTION public.update_spot_saves_count() SET search_path = public;

-- ── 2. Lock down dead/unguarded poll-count RPCs ─────────────────────────────
-- cast_poll_vote (the real voting path) calls recalculate_poll_vote_counts
-- internally via PERFORM — that works fine without a grant, because nested
-- calls inside a SECURITY DEFINER function run with the owner's privileges.
REVOKE EXECUTE ON FUNCTION public.increment_poll_votes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_poll_vote_counts(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. Stop exposing internal RLS-helper predicates as public RPC endpoints ─
-- Revoke the default PUBLIC grant (which anon inherits) and re-grant only to
-- authenticated, which RLS policies still need in order to call these
-- functions when evaluating USING/WITH CHECK clauses for logged-in users.
REVOKE EXECUTE ON FUNCTION public.is_trip_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_trip_member(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_trip_organizer(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_trip_organizer(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_trip_admin(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_trip_admin(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_global_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_global_admin(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_manage_trip(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_trip(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_manage_announcements(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_announcements(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_view_trip_expenses(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_trip_expenses(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_view_expense(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_expense(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_edit_expense(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_edit_expense(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_edit_trip_expenses(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_edit_trip_expenses(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_confirm_settlement(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_confirm_settlement(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_admin_consent(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_admin_consent(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_app_moderator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_app_moderator(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
