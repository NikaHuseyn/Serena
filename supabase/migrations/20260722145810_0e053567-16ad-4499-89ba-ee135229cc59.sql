
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.outfit_comments
  ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_mentions_cap;
ALTER TABLE public.comments
  ADD CONSTRAINT comments_mentions_cap
  CHECK ((COALESCE(array_length(mentioned_user_ids, 1), 0) <= 10));

ALTER TABLE public.outfit_comments
  DROP CONSTRAINT IF EXISTS outfit_comments_mentions_cap;
ALTER TABLE public.outfit_comments
  ADD CONSTRAINT outfit_comments_mentions_cap
  CHECK ((COALESCE(array_length(mentioned_user_ids, 1), 0) <= 10));

CREATE INDEX IF NOT EXISTS comments_mentioned_user_ids_gin
  ON public.comments USING GIN (mentioned_user_ids);
CREATE INDEX IF NOT EXISTS outfit_comments_mentioned_user_ids_gin
  ON public.outfit_comments USING GIN (mentioned_user_ids);

CREATE OR REPLACE FUNCTION public.notify_comment_mentioned_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid;
  prev uuid[];
  added uuid[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    prev := '{}'::uuid[];
  ELSE
    prev := COALESCE(OLD.mentioned_user_ids, '{}'::uuid[]);
  END IF;

  added := ARRAY(
    SELECT u FROM unnest(COALESCE(NEW.mentioned_user_ids, '{}'::uuid[])) AS u
    WHERE u <> NEW.user_id AND u <> ALL(prev)
  );

  FOREACH uid IN ARRAY added LOOP
    INSERT INTO public.notifications (user_id, type, title, message, data, read)
    VALUES (
      uid,
      'mention',
      'You were mentioned',
      'Someone tagged you in a comment',
      jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id, 'actor_id', NEW.user_id, 'source', TG_TABLE_NAME),
      false
    );
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_comment_mentioned_users() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS comments_notify_mentions ON public.comments;
CREATE TRIGGER comments_notify_mentions
AFTER INSERT OR UPDATE OF mentioned_user_ids ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.notify_comment_mentioned_users();

DROP TRIGGER IF EXISTS outfit_comments_notify_mentions ON public.outfit_comments;
CREATE TRIGGER outfit_comments_notify_mentions
AFTER INSERT OR UPDATE OF mentioned_user_ids ON public.outfit_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_comment_mentioned_users();
