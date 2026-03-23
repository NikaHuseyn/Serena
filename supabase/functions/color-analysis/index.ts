import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    // Verify user
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { imageUrl } = await req.json();
    if (!imageUrl) throw new Error("imageUrl is required");

    console.log("Analysing image for user:", user.id);

    const systemPrompt = `You are an expert colour analyst and personal stylist. 
Analyse the person in the uploaded photo and determine:
1. Their skin tone (e.g. fair, light, medium, olive, tan, deep)
2. Their undertone (warm, cool, neutral)
3. Their seasonal colour type (Spring, Summer, Autumn, Winter) with sub-season if possible
4. A list of 8-10 colours that would look best on them (as colour names)
5. A list of 4-6 colours they should avoid
6. Brief styling advice based on their colouring

You MUST use the provide_analysis tool to return your results.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Please analyse this photo and provide a complete colour analysis.",
              },
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "provide_analysis",
              description: "Return the structured colour analysis results",
              parameters: {
                type: "object",
                properties: {
                  skin_tone: {
                    type: "string",
                    description: "The person's skin tone (e.g. fair, light, medium, olive, tan, deep)",
                  },
                  undertone: {
                    type: "string",
                    enum: ["warm", "cool", "neutral"],
                    description: "The person's undertone",
                  },
                  seasonal_type: {
                    type: "string",
                    description: "Seasonal colour type e.g. 'Warm Autumn', 'Cool Summer'",
                  },
                  best_colours: {
                    type: "array",
                    items: { type: "string" },
                    description: "8-10 colours that suit this person best",
                  },
                  colours_to_avoid: {
                    type: "array",
                    items: { type: "string" },
                    description: "4-6 colours to avoid",
                  },
                  styling_advice: {
                    type: "string",
                    description: "Brief styling advice based on their colouring",
                  },
                },
                required: [
                  "skin_tone",
                  "undertone",
                  "seasonal_type",
                  "best_colours",
                  "colours_to_avoid",
                  "styling_advice",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "provide_analysis" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const analysis = JSON.parse(toolCall.function.arguments);

    // Save to profile
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

    const { error: updateError } = await adminSupabase
      .from("user_style_profiles")
      .update({
        color_analysis: analysis,
        analysis_image_url: imageUrl,
        skin_tone: analysis.skin_tone,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Error saving analysis:", updateError);
      // Still return results even if save fails
    }

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("color-analysis error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
