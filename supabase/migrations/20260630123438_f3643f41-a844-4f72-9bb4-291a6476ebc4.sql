
-- 1. Waitlist hardening
DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.waitlist;
CREATE POLICY "Public can join waitlist with valid email"
  ON public.waitlist FOR INSERT TO anon, authenticated
  WITH CHECK (email IS NOT NULL AND char_length(email) BETWEEN 3 AND 320 AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
CREATE POLICY "Only service role can read waitlist"
  ON public.waitlist FOR SELECT TO service_role USING (true);
CREATE POLICY "Only service role can update waitlist"
  ON public.waitlist FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Only service role can delete waitlist"
  ON public.waitlist FOR DELETE TO service_role USING (true);

-- 2. Storage policies
DROP POLICY IF EXISTS "Authenticated users can upload community photos" ON storage.objects;
CREATE POLICY "Users can upload own community photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'community-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Community photos are publicly viewable" ON storage.objects;
CREATE POLICY "Users can list own community photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'community-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Profile photos are publicly viewable" ON storage.objects;
CREATE POLICY "Users can list own profile photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3. Lock down SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.update_post_likes_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_post_comments_count() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_social_profile() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_security_event(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_ai_rate_limit(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_style_leaderboard() FROM PUBLIC;
-- Keep leaderboard reachable for community page (guests + signed-in)
GRANT EXECUTE ON FUNCTION public.get_style_leaderboard() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit(uuid) TO authenticated;

-- 4. Disable auto GraphQL endpoint (app uses REST only)
REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated, PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated, PUBLIC;

-- 5. Drop redundant always-true policy (service_role bypasses RLS)
DROP POLICY IF EXISTS "Service role can manage cultural dress norms" ON public.cultural_dress_norms;
