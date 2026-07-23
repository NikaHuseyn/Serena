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
    INSERT INTO public.notifications (
      user_id,
      type,
      message,
      is_read,
      related_post_id,
      related_user_id
    )
    VALUES (
      uid,
      'mention',
      'You were mentioned in a comment',
      false,
      NEW.post_id,
      NEW.user_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_mentioned_users()
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
    INSERT INTO public.notifications (
      user_id,
      type,
      message,
      is_read,
      related_post_id,
      related_user_id
    )
    VALUES (
      uid,
      'mention',
      'You were mentioned in a post',
      false,
      NEW.id,
      NEW.user_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;