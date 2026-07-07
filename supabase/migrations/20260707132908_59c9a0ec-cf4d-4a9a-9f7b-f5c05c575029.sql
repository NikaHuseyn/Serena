
ALTER FUNCTION public.get_style_leaderboard() SECURITY INVOKER;
ALTER FUNCTION public.is_admin(uuid, text) SECURITY INVOKER;
ALTER FUNCTION public.log_security_event(text, jsonb) SECURITY INVOKER;
ALTER FUNCTION public.check_ai_rate_limit(uuid) SECURITY INVOKER;
