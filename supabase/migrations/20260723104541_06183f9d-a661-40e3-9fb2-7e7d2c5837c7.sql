
DROP POLICY IF EXISTS "Users can delete own comments" ON public.comments;
CREATE POLICY "Users can delete own or post-owner comments"
  ON public.comments FOR DELETE
  USING (
    auth.uid() = user_id
    OR auth.uid() = (SELECT user_id FROM public.posts_base WHERE id = comments.post_id)
  );

DROP POLICY IF EXISTS "Users can delete own outfit comments" ON public.outfit_comments;
CREATE POLICY "Users can delete own or post-owner outfit comments"
  ON public.outfit_comments FOR DELETE
  USING (
    auth.uid() = user_id
    OR auth.uid() = (SELECT user_id FROM public.posts_base WHERE id = outfit_comments.post_id)
  );
