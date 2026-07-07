
-- 1. Fix mutable search_path on remaining functions
ALTER FUNCTION public.posts_view_write() SET search_path = public;
ALTER FUNCTION public.check_guest_rate_limit(text, integer) SET search_path = public;
ALTER FUNCTION public.protect_posts_columns() SET search_path = public;
ALTER FUNCTION public.protect_social_profile_columns() SET search_path = public;

-- 2. Lock down SECURITY DEFINER function execution
-- Revoke broad execute on all public functions, then re-grant only client-called RPCs
REVOKE EXECUTE ON FUNCTION public.handle_new_user_social_profile() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_post_likes_count() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_post_comments_count() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_mentioned_users() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_posts_count() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.posts_view_write() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_posts_columns() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_social_profile_columns() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_guest_rate_limit(text, integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_security_event(text, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_ai_rate_limit(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_style_leaderboard() FROM PUBLIC;
-- keep get_style_leaderboard callable by anon/authenticated (public leaderboard)
GRANT EXECUTE ON FUNCTION public.get_style_leaderboard() TO anon, authenticated;
-- keep RPCs used by the client for signed-in users
GRANT EXECUTE ON FUNCTION public.is_admin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_event(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit(uuid) TO authenticated;

-- 3. Hide tables from the public GraphQL schema (app uses PostgREST, not GraphQL)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'graphql_public') THEN
    EXECUTE 'REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated';
  END IF;
END $$;

-- 4. Waitlist: prevent duplicate-email spam
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_unique_idx ON public.waitlist (lower(email));
