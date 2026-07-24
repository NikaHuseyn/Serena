import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CategorizationRequest {
  itemName?: string;
  description?: string;
  imageBase64?: string;
  dominantColor?: string;
  extractedColors?: string[];
}

// Legacy response shape kept intact so the client form doesn't need to change.
interface CategorizationResult {
  category: string;          // lowercase enum: dress/top/bottom/shoes/outerwear/accessory
  subcategory?: string;      // used by the client to build the item name
  suggestedBrand?: string;
  colors: string[];          // plain colour word (not hex)
  tags: string[];            // notes as tags
  confidence: number;
  reasoning: string;
}

const CATEGORY_ENUM = ["dress", "top", "bottom", "shoes", "outerwear", "accessory"] as const;

function fallback(reason: string, extras: Partial<CategorizationResult> = {}): CategorizationResult {
  return {
    category: "",
    subcategory: "",
    suggestedBrand: "",
    colors: [],
    tags: [],
    confidence: 0,
    reasoning: reason,
    ...extras,
  };
}

async function checkIpRateLimit(req: Request, dailyLimit = 60): Promise<boolean> {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return true;
    const res = await fetch(`${url}/rest/v1/rpc/check_guest_rate_limit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ ip_param: ip, daily_limit: dailyLimit }),
    });
    const data = await res.json().catch(() => ({}));
    return data?.allowed !== false;
  } catch { return true; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (!(await checkIpRateLimit(req, 60))) {
    return new Response(JSON.stringify(fallback('Rate limit exceeded')), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { itemName, description, imageBase64 }: CategorizationRequest = await req.json();

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!imageBase64 && !itemName && !description) {
      throw new Error("An image, item name or description is required");
    }

    const systemPrompt = `You are a fashion garment recogniser. Look at the photo and identify the single main garment.

Return STRICT JSON only, no prose, matching exactly:
{
  "name": string,       // short descriptive name, e.g. "Black slip dress", "Cream cable-knit jumper"
  "category": "dress" | "top" | "bottom" | "shoes" | "outerwear" | "accessory",
  "colour": string,     // plain English colour word only ("black", "navy", "sage"), never a hex code
  "brand": string | null,
  "notes": string | null // brief fabric/style details visible in the photo, or null
}

Hard rules:
- A dress (including slip, mini, midi, maxi, shirt, wrap, bodycon dress) MUST be "dress", NEVER "top".
- Skirts, trousers, jeans, shorts => "bottom".
- Jackets, coats, blazers, cardigans => "outerwear".
- T-shirts, blouses, shirts, jumpers, sweaters, tanks => "top".
- Bags, belts, hats, scarves, jewellery, sunglasses => "accessory".
- If the image genuinely cannot be read, return every field as null.
- Never invent a brand — if you cannot see a clear logo, brand must be null.`;

    const userContent: any[] = [];
    if (imageBase64) {
      userContent.push({ type: "text", text: "Identify this garment." });
      userContent.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
      });
    } else {
      userContent.push({
        type: "text",
        text: `Identify this garment from text only.\nName: ${itemName || "(none)"}\nDescription: ${description || "(none)"}`,
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(
        JSON.stringify(fallback(`AI gateway error ${response.status}`)),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return new Response(JSON.stringify(fallback("No content in AI response")), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: any;
    try {
      const cleaned = String(content).replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse AI JSON:", content);
      return new Response(JSON.stringify(fallback("Invalid JSON from AI")), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawName: string | null = typeof parsed.name === "string" ? parsed.name.trim() : null;
    const rawCategory: string | null =
      typeof parsed.category === "string" ? parsed.category.toLowerCase().trim() : null;
    const rawColour: string | null =
      typeof parsed.colour === "string" ? parsed.colour.trim() : (typeof parsed.color === "string" ? parsed.color.trim() : null);
    const rawBrand: string | null = typeof parsed.brand === "string" ? parsed.brand.trim() : null;
    const rawNotes: string | null = typeof parsed.notes === "string" ? parsed.notes.trim() : null;

    const category =
      rawCategory && (CATEGORY_ENUM as readonly string[]).includes(rawCategory) ? rawCategory : "";

    // Strip a hex code if the model slipped one in.
    const colour = rawColour && !rawColour.startsWith("#") ? rawColour.toLowerCase() : "";

    // Derive subcategory: the descriptive part of the name minus the colour prefix,
    // so the client's buildItemName reproduces the full name ("black" + "slip dress").
    let subcategory = "";
    if (rawName) {
      let s = rawName;
      if (colour) {
        const re = new RegExp(`^\\s*${colour.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s+`, "i");
        s = s.replace(re, "");
      }
      subcategory = s.trim();
    }
    // Guarantee dress category yields a dress-typed subcategory
    if (category === "dress" && subcategory && !/dress/i.test(subcategory)) {
      subcategory = `${subcategory} dress`.trim();
    }
    if (!subcategory && category) {
      subcategory = category === "accessory" ? "accessory" : category;
    }

    const result: CategorizationResult = {
      category,
      subcategory,
      suggestedBrand: rawBrand || "",
      colors: colour ? [colour] : [],
      tags: rawNotes ? [rawNotes] : [],
      confidence: rawName || category ? 0.9 : 0,
      reasoning: rawName ? `Detected: ${rawName}` : "Image could not be read",
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in categorize-wardrobe-item:", error);
    return new Response(JSON.stringify(fallback(`Failed: ${(error as Error).message}`)), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
