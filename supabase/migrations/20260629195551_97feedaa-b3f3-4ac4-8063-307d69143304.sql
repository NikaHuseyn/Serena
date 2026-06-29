
-- Grant anon SELECT on community-read tables
GRANT SELECT ON public.posts TO anon;
GRANT SELECT ON public.social_profiles TO anon;
GRANT SELECT ON public.likes TO anon;
GRANT SELECT ON public.comments TO anon;
GRANT SELECT ON public.outfit_votes TO anon;
GRANT SELECT ON public.outfit_comments TO anon;
GRANT SELECT ON public.user_badges TO anon;

-- Replace authenticated-only SELECT policies with public read policies
DROP POLICY IF EXISTS "Posts are viewable by all authenticated" ON public.posts;
CREATE POLICY "Posts are publicly viewable" ON public.posts FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Social profiles are viewable by all authenticated" ON public.social_profiles;
CREATE POLICY "Social profiles are publicly viewable" ON public.social_profiles FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Likes are viewable by all authenticated" ON public.likes;
CREATE POLICY "Likes are publicly viewable" ON public.likes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Comments are viewable by all authenticated" ON public.comments;
CREATE POLICY "Comments are publicly viewable" ON public.comments FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Votes viewable by all authenticated" ON public.outfit_votes;
CREATE POLICY "Votes are publicly viewable" ON public.outfit_votes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Outfit comments viewable by all authenticated" ON public.outfit_comments;
CREATE POLICY "Outfit comments are publicly viewable" ON public.outfit_comments FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Badges viewable by all authenticated" ON public.user_badges;
CREATE POLICY "Badges are publicly viewable" ON public.user_badges FOR SELECT TO anon, authenticated USING (true);
