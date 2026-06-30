
-- 1. Extend posts
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS brand_tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS location text;

CREATE INDEX IF NOT EXISTS posts_tags_gin ON public.posts USING GIN (tags);
CREATE INDEX IF NOT EXISTS posts_brand_tags_gin ON public.posts USING GIN (brand_tags);
CREATE INDEX IF NOT EXISTS posts_mentioned_user_ids_gin ON public.posts USING GIN (mentioned_user_ids);

-- 2. Brands directory
CREATE TABLE IF NOT EXISTS public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.brands TO anon, authenticated;
GRANT ALL ON public.brands TO service_role;

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Brands are publicly viewable" ON public.brands;
CREATE POLICY "Brands are publicly viewable"
  ON public.brands FOR SELECT
  USING (true);

-- Seed brands (idempotent)
INSERT INTO public.brands (name, slug) VALUES
  ('Zara','zara'),('H&M','h-and-m'),('COS','cos'),('Arket','arket'),('Uniqlo','uniqlo'),
  ('& Other Stories','and-other-stories'),('Massimo Dutti','massimo-dutti'),('Mango','mango'),
  ('Reformation','reformation'),('Ganni','ganni'),('Aritzia','aritzia'),('Madewell','madewell'),
  ('Everlane','everlane'),('Nike','nike'),('Adidas','adidas'),('New Balance','new-balance'),
  ('Nordstrom','nordstrom'),('Net-a-Porter','net-a-porter'),('SSENSE','ssense'),('Farfetch','farfetch'),
  ('Vinted','vinted'),('Depop','depop'),('ASOS','asos'),('Boden','boden'),('Whistles','whistles'),
  ('Reiss','reiss'),('Ted Baker','ted-baker'),('AllSaints','allsaints'),('Acne Studios','acne-studios'),
  ('Toteme','toteme'),('Khaite','khaite'),('The Row','the-row'),('Loewe','loewe'),('Bottega Veneta','bottega-veneta'),
  ('Prada','prada'),('Miu Miu','miu-miu'),('Gucci','gucci'),('Saint Laurent','saint-laurent'),
  ('Celine','celine'),('Chanel','chanel'),('Hermès','hermes'),('Louis Vuitton','louis-vuitton'),
  ('Dior','dior'),('Burberry','burberry'),('Stella McCartney','stella-mccartney'),
  ('Isabel Marant','isabel-marant'),('Sandro','sandro'),('Maje','maje'),('Sézane','sezane'),
  ('Rouje','rouje'),('Free People','free-people'),('Anthropologie','anthropologie'),
  ('Urban Outfitters','urban-outfitters'),('Lululemon','lululemon'),('Alo Yoga','alo-yoga'),
  ('Patagonia','patagonia'),('The North Face','the-north-face'),('Carhartt','carhartt'),
  ('Levi''s','levis'),('Diesel','diesel'),('Calvin Klein','calvin-klein'),('Tommy Hilfiger','tommy-hilfiger'),
  ('Polo Ralph Lauren','polo-ralph-lauren'),('Lacoste','lacoste'),('J.Crew','jcrew'),
  ('Banana Republic','banana-republic'),('Gap','gap'),('Old Navy','old-navy'),('Target','target'),
  ('Marks & Spencer','marks-and-spencer'),('John Lewis','john-lewis'),('Selfridges','selfridges'),
  ('Harrods','harrods'),('MyTheresa','mytheresa'),('Matches','matches'),('Browns','browns'),
  ('END.','end'),('Mr Porter','mr-porter'),('Shopbop','shopbop'),('Revolve','revolve'),
  ('Princess Polly','princess-polly'),('PrettyLittleThing','prettylittlething'),('Boohoo','boohoo')
ON CONFLICT (name) DO NOTHING;

-- 3. Mention notification trigger
CREATE OR REPLACE FUNCTION public.notify_mentioned_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      'Someone tagged you in a post',
      jsonb_build_object('post_id', NEW.id, 'actor_id', NEW.user_id),
      false
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_notify_mentions ON public.posts;
CREATE TRIGGER posts_notify_mentions
AFTER INSERT OR UPDATE OF mentioned_user_ids ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.notify_mentioned_users();
