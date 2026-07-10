import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Fallback hex lookup for common colour names the analysis produces.
// Used when the model returns a missing / malformed / near-white / near-grey hex
// that doesn't plausibly match the colour name.
const COLOUR_FALLBACK: Record<string, string> = {
  black: "#000000", white: "#ffffff", ivory: "#fffff0", cream: "#fffdd0",
  "warm white": "#faf0e6", "off-white": "#f5f5f0", "icy white": "#f5fbff",
  beige: "#e6d5b8", camel: "#c19a6b", tan: "#d2b48c", khaki: "#c3b091",
  taupe: "#8b7d6b", stone: "#a89f8e", sand: "#c2b280",
  brown: "#6b4423", "chocolate brown": "#3d2314", chocolate: "#4b2e1f",
  espresso: "#3b271c", "warm brown": "#7a4a2a", mahogany: "#6b2f1a",
  charcoal: "#36454f", slate: "#556877", "cool grey": "#8a9099",
  gray: "#6b7280", grey: "#6b7280", silver: "#c0c0c0",
  navy: "#0a1a3a", "midnight blue": "#0a0f2c", "deep blue": "#00246b",
  "cobalt blue": "#0047ab", "royal blue": "#2a4fc8", "true blue": "#0f52ba",
  blue: "#2563eb", "sky blue": "#5fb0e8", "powder blue": "#a8ccd7",
  "icy blue": "#c8e8f2", "baby blue": "#a7c7e7", periwinkle: "#8a9ee0",
  teal: "#0d8a8a", "deep teal": "#0a5f6e", turquoise: "#2ec4b6", aqua: "#3ec7c7",
  "emerald green": "#00754a", emerald: "#00754a", "forest green": "#0f4d2a",
  "olive green": "#6b6a1e", olive: "#6b6a1e", "sage green": "#94a37a",
  sage: "#94a37a", mint: "#8ed4a2", "mint green": "#8ed4a2",
  "kelly green": "#2ea44f", "grass green": "#2ea44f", green: "#1f9d55",
  "hunter green": "#0f4a2f", "lime green": "#96d43a",
  yellow: "#f5c518", "warm yellow": "#f0b429", mustard: "#c99a2e",
  "golden yellow": "#e8a83a", gold: "#c9a227", "buttery yellow": "#f5df7a",
  orange: "#e8742b", "burnt orange": "#b8541a", "warm orange": "#dc6a1f",
  peach: "#f2b58e", apricot: "#e89a63", coral: "#f26a5a", "warm coral": "#eb5a45",
  salmon: "#e88a75", terracotta: "#c85a3a", rust: "#a54a24", "brick red": "#9a2f1e",
  red: "#c8202b", "tomato red": "#dc3226", "true red": "#c8202b",
  "cherry red": "#c41e3a", "warm red": "#c8322a", crimson: "#9c1c2e",
  burgundy: "#5c1626", wine: "#5c1a2a", maroon: "#5a1a20", oxblood: "#4a1218",
  pink: "#e6598a", "hot pink": "#e8358a", "shocking pink": "#e83596",
  "soft pink": "#f5b8c8", "blush pink": "#f2c5cc", "dusty pink": "#d59aa2",
  "dusty rose": "#c58a92", rose: "#e04a72", "warm pink": "#e6608a",
  fuchsia: "#e024a8", magenta: "#c026a2", raspberry: "#b21e5e",
  plum: "#5c2a54", "deep plum": "#3e1a3a", aubergine: "#3a1e3a",
  eggplant: "#472a48", purple: "#6a2ca0", violet: "#7a3ec4",
  lavender: "#bfa8d9", lilac: "#c8b0e0", mauve: "#a97fa5", orchid: "#c060c0",
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

function isRealColourWord(name: string): boolean {
  const n = name.toLowerCase().trim();
  // Any known token match => real colour word
  if (COLOUR_FALLBACK[n]) return true;
  return n.split(/\s+/).some((w) => COLOUR_FALLBACK[w]);
}

function fallbackHexFor(name: string): string | null {
  const n = name.toLowerCase().trim();
  if (COLOUR_FALLBACK[n]) return COLOUR_FALLBACK[n];
  const words = n.split(/\s+/);
  for (const w of words) if (COLOUR_FALLBACK[w]) return COLOUR_FALLBACK[w];
  return null;
}

function needsFallback(hex: string | undefined | null, name: string): boolean {
  if (!hex) return isRealColourWord(name);
  const rgb = hexToRgb(hex);
  if (!rgb) return isRealColourWord(name);
  const [r, g, b] = rgb;
  const nearWhite = r > 220 && g > 220 && b > 220;
  const nearGrey = Math.abs(r - g) <= 15 && Math.abs(g - b) <= 15 && Math.abs(r - b) <= 15;
  const nameLower = name.toLowerCase();
  const nameAllowsNeutral =
    /white|grey|gray|silver|ivory|cream|stone|off|ash|charcoal|black/.test(nameLower);
  if ((nearWhite || nearGrey) && !nameAllowsNeutral && isRealColourWord(name)) return true;
  return false;
}

function sanitiseColourList(list: any): Array<{ name: string; hex: string }> {
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => {
      const name = typeof c?.name === "string" ? c.name : "";
      let hex = typeof c?.hex === "string" ? c.hex : "";
      if (!hex.startsWith("#")) hex = "#" + hex.replace(/^#/, "");
      if (needsFallback(hex, name)) {
        const fb = fallbackHexFor(name);
        if (fb) hex = fb;
      }
      return { name, hex };
    })
    .filter((c) => c.name);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { imageUrl, imagePath } = await req.json();
    if (!imageUrl) throw new Error("imageUrl is required");

    console.log("Analysing image for user:", user.id);

    const systemPrompt = `You are a professional colour analyst performing a 12-season personal colour analysis from a photograph.

STEP 0 — PHOTO QUALITY GATE. Assess the photo, then choose one of three paths:
1. ANALYSE NORMALLY: bare-faced, even natural light, face clear.
2. ANALYSE WITH REDUCED CONFIDENCE: bare-faced but imperfect — mild reflections or haze, slightly uneven or indoor-but-reasonable lighting, slight softness. Set confidence to 'medium' or 'low' and name the specific limitation in the evidence fields.
3. RETAKE: ANY visible makeup (eyeliner, mascara, lipstick, foundation — any amount), heavy filters, face substantially obscured, very dark or very blurry, or severe colour cast / harsh directional light. Makeup of any kind is always a retake — state which makeup was detected in the retake_reason.
Never reject for natural features of the face itself (under-eye shading, deep-set eyes).

STEP 1 — ASSESS THREE DIMENSIONS (professional methodology). Examine
skin, eyes, and hair together:
- UNDERTONE: warm / cool / neutral. Evidence: skin's golden vs pink cast, eye colour temperature, hair's ash vs golden quality.
- VALUE: light / medium / deep. Overall depth of colouring.
- CHROMA: clear / soft. Whether colouring is bright and contrasted
  or muted and blended.
State the evidence for each judgment explicitly.

STEP 2 — MAP TO ONE OF THE 12 SEASONS: Light Spring, True Spring,
Bright Spring, Light Summer, True Summer, Soft Summer, Soft Autumn,
True Autumn, Deep Autumn, Deep Winter, True Winter, Bright Winter.
Choose the single best fit. If genuinely between two, name the
primary and note the secondary.

STEP 3 — OUTPUT. Hex codes must accurately represent each named
colour — a swatch of "Fuchsia" must render as vivid pink-purple,
never pale or grey. This applies equally to avoid_colours.
Return ONLY valid JSON, no markdown, no preamble:
{
  "status": "ok" | "retake",
  "retake_reason": string or null,
  "season": string or null,
  "secondary_season": string or null,
  "confidence": "high" | "medium" | "low",
  "skin_tone": "short description, e.g. light / light to medium /
    medium / deep",
  "undertone": {"verdict": string, "evidence": string},
  "value": {"verdict": string, "evidence": string},
  "chroma": {"verdict": string, "evidence": string},
  "best_colours": [8-12 colour names with hex codes, e.g.
    {"name": "Emerald", "hex": "#009B77"}],
  "avoid_colours": [4-6 colours with hex codes],
  "summary": "2-3 sentences in British English, warm and
    professional, explaining her season and how to use it"
}
Use British English throughout. Never guess on an unusable photo - return the retake status instead.`;

    const colourItemSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        hex: { type: "string", description: "Hex colour code e.g. #009B77" },
      },
      required: ["name", "hex"],
      additionalProperties: false,
    };

    const dimensionSchema = {
      type: "object",
      properties: {
        verdict: { type: "string" },
        evidence: { type: "string" },
      },
      required: ["verdict", "evidence"],
      additionalProperties: false,
    };

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
              { type: "text", text: "Please analyse this photo and provide a complete 12-season colour analysis." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "provide_analysis",
              description: "Return the structured 12-season colour analysis results",
              parameters: {
                type: "object",
                properties: {
                  status: { type: "string", enum: ["ok", "retake"] },
                  retake_reason: { type: ["string", "null"] },
                  season: { type: ["string", "null"] },
                  secondary_season: { type: ["string", "null"] },
                  confidence: { type: "string", enum: ["high", "medium", "low"] },
                  skin_tone: { type: "string" },
                  undertone: dimensionSchema,
                  value: dimensionSchema,
                  chroma: dimensionSchema,
                  best_colours: { type: "array", items: colourItemSchema },
                  avoid_colours: { type: "array", items: colourItemSchema },
                  summary: { type: "string" },
                },
                required: [
                  "status",
                  "confidence",
                  "skin_tone",
                  "undertone",
                  "value",
                  "chroma",
                  "summary",
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

    const raw = JSON.parse(toolCall.function.arguments);

    // Retake path — do not save.
    if (raw.status === "retake") {
      return new Response(
        JSON.stringify({
          analysis: {
            status: "retake",
            retake_reason: raw.retake_reason || "Please retake your photo in even, natural light.",
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Canonical per-season palette lookup — best/avoid colours come from
    // SEASON_PALETTES, not the AI. Fall back to the AI's own colours if the
    // returned season name is not in the map.
    const seasonKey = typeof raw.season === "string" ? raw.season.trim() : "";
    const palette = SEASON_PALETTES[seasonKey];
    let bestColours: Array<{ name: string; hex: string; group?: string }>;
    let avoidColours: Array<{ name: string; hex: string }>;
    if (palette) {
      bestColours = [
        ...palette.neutrals.map((c) => ({ ...c, group: "neutral" as const })),
        ...palette.accents.map((c) => ({ ...c, group: "accent" as const })),
        ...palette.statements.map((c) => ({ ...c, group: "statement" as const })),
      ];
      avoidColours = palette.avoid.map((c) => ({ name: c.name, hex: c.hex }));
    } else {
      console.warn(
        `Season "${seasonKey}" not found in SEASON_PALETTES — falling back to AI-generated colours.`,
      );
      bestColours = sanitiseColourList(raw.best_colours);
      avoidColours = sanitiseColourList(raw.avoid_colours);
    }

    const analysis = {
      status: "ok" as const,
      retake_reason: null,
      season: raw.season || null,
      secondary_season: raw.secondary_season || null,
      confidence: raw.confidence,
      skin_tone: raw.skin_tone,
      undertone: raw.undertone,
      value: raw.value,
      chroma: raw.chroma,
      best_colours: bestColours,
      avoid_colours: avoidColours,
      summary: raw.summary,
    };


    // Save to profile
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

    const { error: updateError } = await adminSupabase
      .from("user_style_profiles")
      .update({
        color_analysis: analysis,
        analysis_image_url: imagePath || imageUrl,
        skin_tone: analysis.skin_tone,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Error saving analysis:", updateError);
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
