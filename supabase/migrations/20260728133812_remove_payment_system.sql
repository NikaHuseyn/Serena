-- Remove the Stripe payment system: no product uses it, and the
-- create-payment / verify-payment edge functions have been deleted.
DROP FUNCTION IF EXISTS public.upgrade_user_subscription(text, text, uuid);
DROP TABLE IF EXISTS public.payment_transactions;
