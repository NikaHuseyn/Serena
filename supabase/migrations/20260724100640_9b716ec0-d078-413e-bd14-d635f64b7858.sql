
-- 1. Recreate views with security_invoker so RLS is enforced per caller
ALTER VIEW IF EXISTS public.challenge_leaderboard SET (security_invoker = true);
ALTER VIEW IF EXISTS public.milestones_public SET (security_invoker = true);
ALTER VIEW IF EXISTS public.posts SET (security_invoker = true);

-- 2. Fix mutable search_path on trigger functions
ALTER FUNCTION public.forbid_points_mutation() SET search_path = public;
ALTER FUNCTION public.update_post_comments_count() SET search_path = public;
ALTER FUNCTION public.update_post_likes_count() SET search_path = public;

-- 3. Revoke EXECUTE from public/anon/authenticated on SECURITY DEFINER helpers
--    that should only be invoked from triggers or trusted server-side code.
DO $$
DECLARE
  fn text;
BEGIN
  FOR fn IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'apply_points_to_balance',
        'award_points',
        'check_guest_rate_limit',
        'check_milestones',
        'flag_like_velocity',
        'handle_new_user_social_profile',
        'notify_comment_mentioned_users',
        'notify_mentioned_users',
        'purge_user_data',
        'reverse_points',
        'sync_posts_count',
        'trg_award_comment_points',
        'trg_award_entry_bonus',
        'trg_award_post_points',
        'trg_award_vote_points',
        'trg_reverse_post_points'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END$$;
