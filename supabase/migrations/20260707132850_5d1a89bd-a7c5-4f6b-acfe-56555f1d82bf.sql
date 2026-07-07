
ALTER FUNCTION public.sync_posts_count() SET search_path = public;

-- Disable pg_graphql exposure of public schema tables
COMMENT ON SCHEMA public IS e'@graphql({"inflect_names": true, "max_rows": 0})';
