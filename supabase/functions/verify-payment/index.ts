import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { session_id } = await req.json();
    
    if (!session_id) {
      throw new Error("Session ID is required");
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Require an authenticated caller — payment session details are
    // sensitive (email, amount, payment method) and must not be returned
    // to anyone who happens to know a Stripe session id.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerUserId = userData.user.id;

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (!session) {
      throw new Error("Session not found");
    }

    // The caller may only inspect / trigger their OWN session.
    if (session.metadata?.user_id && session.metadata.user_id !== callerUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log('Session status:', session.payment_status);
    console.log('Session metadata:', session.metadata);

    // Update transaction status
    const { error: updateError } = await supabase
      .from("payment_transactions")
      .update({
        status: session.payment_status === 'paid' ? 'succeeded' : session.payment_status,
        stripe_payment_intent_id: session.payment_intent,
        updated_at: new Date().toISOString()
      })
      .eq('stripe_session_id', session_id);

    if (updateError) {
      console.error('Error updating transaction:', updateError);
    }

    // If payment was successful, upgrade user's subscription tier
    if (session.payment_status === 'paid' && session.metadata?.tier_upgrade) {
      const customerEmail = session.customer_details?.email;
      
      if (customerEmail) {
        console.log('Upgrading user to tier:', session.metadata.tier_upgrade);
        
        const { data: upgradeResult, error: upgradeError } = await supabase.rpc('upgrade_user_subscription', {
          user_email: customerEmail,
          new_tier: session.metadata.tier_upgrade,
          target_user_id: session.metadata.user_id || null
        });

        if (upgradeError) {
          console.error('Error upgrading user subscription:', upgradeError);
        } else {
          console.log('Successfully upgraded user subscription:', upgradeResult);
        }
      }
    }

    return new Response(JSON.stringify({ 
      payment_status: session.payment_status,
      session_details: {
        amount_total: session.amount_total,
        currency: session.currency,
        customer_email: session.customer_details?.email,
        payment_method_types: session.payment_method_types
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error in verify-payment function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});