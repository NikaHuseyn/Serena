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
    const { productType = 'ai_credits_pack' } = await req.json();
    
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user?.email) {
      throw new Error("User not authenticated or email not available");
    }

    const user = userData.user;
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const origin = req.headers.get("origin") || "https://yourapp.com";
    
    // Define products and their configurations
    const products = {
      ai_credits_pack: {
        name: "AI Recommendations Credits (50 pack)",
        amount: 999, // $9.99
        mode: "payment",
        tier_upgrade: 'premium'
      },
      premium_subscription: {
        name: "Premium Monthly Subscription",
        amount: 1999, // $19.99
        mode: "subscription",
        tier_upgrade: 'premium'
      },
      pro_subscription: {
        name: "Pro Monthly Subscription",
        amount: 4999, // $49.99
        mode: "subscription",
        tier_upgrade: 'pro'
      }
    };

    // Price and product configuration is ALWAYS looked up server-side.
    // The client cannot influence the charged amount — only which product to buy.
    const product = products[productType];
    if (!product) {
      throw new Error("Invalid productType");
    }

    // Create checkout session
    const sessionConfig = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { 
              name: product.name,
              description: productType === 'ai_credits_pack' 
                ? "Get 50 AI-powered outfit recommendations that work with your personal style"
                : `${product.tier_upgrade} tier access with increased AI recommendation limits`
            },
            unit_amount: product.amount,
            ...(product.mode === "subscription" && {
              recurring: { interval: "month" }
            })
          },
          quantity: 1,
        },
      ],
      mode: product.mode,
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/payment-canceled`,
      metadata: {
        user_id: user.id,
        product_type: productType,
        tier_upgrade: product.tier_upgrade
      }
    };

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // Record transaction in database
    await supabase.from("payment_transactions").insert({
      user_id: user.id,
      email: user.email,
      stripe_customer_id: customerId,
      stripe_session_id: session.id,
      amount: product.amount,
      currency: "usd",
      status: "pending",
      payment_type: product.mode,
      product_type: productType,
      metadata: { tier_upgrade: product.tier_upgrade }
    });

    return new Response(JSON.stringify({ 
      url: session.url,
      session_id: session.id 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error in create-payment function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});