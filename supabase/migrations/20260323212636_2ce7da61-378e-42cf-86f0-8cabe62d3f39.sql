
-- 1. Create community-photos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-photos', 'community-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for community-photos bucket
CREATE POLICY "Authenticated users can upload community photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'community-photos');

CREATE POLICY "Community photos are publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'community-photos');

CREATE POLICY "Users can delete own community photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'community-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 2. Trigger to auto-update posts.likes_count
CREATE OR REPLACE FUNCTION public.update_post_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER on_like_change
AFTER INSERT OR DELETE ON public.likes
FOR EACH ROW
EXECUTE FUNCTION public.update_post_likes_count();

-- 3. Trigger to auto-create social_profiles on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_social_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.social_profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Add unique constraint on social_profiles.user_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'social_profiles_user_id_key'
  ) THEN
    ALTER TABLE public.social_profiles ADD CONSTRAINT social_profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

CREATE TRIGGER on_auth_user_created_social_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_social_profile();

-- 4. Trigger to auto-update posts.comments_count
CREATE OR REPLACE FUNCTION public.update_post_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER on_comment_change
AFTER INSERT OR DELETE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.update_post_comments_count();
