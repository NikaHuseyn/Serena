
-- Add new columns to posts table
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS post_type text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS occasion_context text,
  ADD COLUMN IF NOT EXISTS poll_question text,
  ADD COLUMN IF NOT EXISTS oracle_summary text,
  ADD COLUMN IF NOT EXISTS oracle_summary_public boolean NOT NULL DEFAULT false;

-- Create outfit_votes table
CREATE TABLE public.outfit_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index integer NOT NULL CHECK (option_index >= 0 AND option_index <= 4),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);

ALTER TABLE public.outfit_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Votes viewable by all authenticated" ON public.outfit_votes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own votes" ON public.outfit_votes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own votes" ON public.outfit_votes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes" ON public.outfit_votes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Create outfit_comments table
CREATE TABLE public.outfit_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index integer,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.outfit_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Outfit comments viewable by all authenticated" ON public.outfit_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert outfit comments" ON public.outfit_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own outfit comments" ON public.outfit_comments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Add post_id to existing notifications table (it already exists but we need to ensure the columns we need)
-- notifications table already has: id, user_id, post_id, type, created_at, is_read, message
-- We just need to use it. The 'read' field is 'is_read' in the existing table.

-- Enable realtime for outfit_votes
ALTER PUBLICATION supabase_realtime ADD TABLE public.outfit_votes;
