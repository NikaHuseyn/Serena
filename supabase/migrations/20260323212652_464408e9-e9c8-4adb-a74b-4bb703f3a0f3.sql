
-- Backfill social profiles for existing users
INSERT INTO public.social_profiles (user_id, display_name)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1))
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.social_profiles sp WHERE sp.user_id = u.id);
