
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
  LOOP
    EXECUTE format('COMMENT ON TABLE public.%I IS %L', t, '@graphql({"skip": true})');
  END LOOP;
END $$;
