ALTER TABLE public.user_style_profiles
  ADD COLUMN IF NOT EXISTS home_city text,
  ADD COLUMN IF NOT EXISTS default_budget numeric,
  ADD COLUMN IF NOT EXISTS budget_currency text DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS items_to_avoid text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS shopping_preference text,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS primary_occasions text[] DEFAULT '{}'::text[];