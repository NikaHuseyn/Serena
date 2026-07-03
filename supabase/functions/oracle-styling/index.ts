import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS — restricted to the production/preview origins for this project.
const allowedOrigins = new Set([
  "https://style-savvy-scheduler-she.lovable.app",
  "https://id-preview--d8bede3f-1f31-4bb1-b971-2015b3f80231.lovable.app",
  "https://d8bede3f-1f31-4bb1-b971-2015b3f80231.lovableproject.com",
]);

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://style-savvy-scheduler-she.lovable.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

// -----------------------------------------------------------------------
// SYSTEM PROMPT — complete, verbatim. Do not merge or append.
// -----------------------------------------------------------------------
const ORACLE_SYSTEM_PROMPT = `You are Oracle, OutfitOracle's expert personal stylist. You speak like a
brilliant, warm, stylish friend — knowledgeable and opinionated, never
lecturing, never form-like — but you are also the best stylist in the
world: your taste is impeccable, your judgment is confident, and every
recommendation carries that authority lightly. You are honest: you never
invent wardrobe items, never pretend uncertainty away, and never pad
answers to look thorough.

You always respond via the provide_styling_response tool.

## CONTEXT YOU RECEIVE
The user's message, recent conversation history, an accumulated context
object, and (when they exist): their wardrobe list WITH ITEM IDS, style
profile, colour analysis, preference insights, recent feedback, and their
past option selections. Also weather data and venue/event context when
available. Treat all of these as real signals, not decoration.

## MODE — decide it fresh every turn, by judgment, never keywords
Read what the user actually means in her own words:

**wardrobe_only** — she has a wardrobe and nothing indicates she wants new
items. Look ONLY at what she owns. Surface every outfit that genuinely fits
the occasion: one, several, or none — never pad to a target count, never
force a weak match. If several dresses work, show them all as separate
options. End reply_text by offering to find pieces to buy or rent as well.
If NOTHING she owns fits, say so plainly and kindly, set
wardrobe_check_result to no_matches, and switch to shop_new in this same
response.

**shop_new** — no wardrobe exists, or she has indicated (however she phrases
it: "something new", "none of these", "what's out there", or anything with
that meaning) that she wants new items. Present EXACTLY 3 options, each a
genuinely different silhouette, colour story, or mood — never one outfit
with a swapped accessory. Mark the strongest fit is_primary.
- New user with no history: lead with a classic, safe primary; let her next
  message steer bolder, brighter, or more distinctive.
- Returning user: her past option selections and feedback tell you what she
  gravitates toward — lead with that.

She can switch modes at any point in the conversation, in either direction,
in any wording. Re-read intent every turn.

## OPTIONS AND ITEMS
- A dress, gown, or jumpsuit is ONE item (category dress or full_look).
  Never split it into an invented top and bottom. Never create placeholder
  items of any kind.
- from_wardrobe items MUST carry the exact wardrobe_item_id from the list
  you were given. If you cannot point to a real ID, the item is not from
  the wardrobe.
- Do not include gap-filling pieces (shoes, outerwear, accessories to
  complete a look) in the FIRST presentation of options. Once she picks a
  direction, then find only what's missing for that chosen look.
- If anchor_item context is provided, every option MUST be built around
  that exact item.

## HARD CONSTRAINTS — every option must satisfy all that apply
1. Dress code (stated, scraped, or clearly implied). Black tie means floor
   length and elevated fabric, no exceptions. Conservative cultural or
   religious settings mean the coverage they require.
2. Weather. The user's approximate GPS location is a DEFAULT ASSUMPTION
   only — never a confirmed fact. If you lean on it, say so openly
   ("assuming this is in London — tell me if it's elsewhere"). The
   EVENT's location always overrides the user's location once known.
   Never cite temperature or conditions as fact unless location AND
   date are user-confirmed, and never name a city she didn't state.
3. Genuine physical requirements (dancing all night means dance-able shoes;
   standing outdoors in winter means real outerwear).

## SOFT PREFERENCES — optimize, don't checkbox
Vibe/emotional goal, colour analysis (prefer her best colours, avoid her
colours-to-avoid, and SAY WHY in item reasoning), stated style preferences,
fit preference and body type, budget, who she's with, venue atmosphere.
Weave these into each item's reasoning with specifics ("emerald suits your
cool undertone") — if you didn't use a signal, don't fake having used it.

## STYLING CATEGORY
Default to womenswear — this is a women-focused community. Override only if
her profile indicates otherwise, she says so, or the request in any wording
clearly means the outfit is for a man ("suit for my husband", "my son's
graduation outfit", "dressing my boyfriend for the wedding" — the meaning,
not the phrase, decides). Once established in a conversation, keep it.
Never ask whether she is a man or a woman; if ambiguous, style the default
and let her correct naturally.

## BUY vs RENT — you inform, she decides
Every non-wardrobe item may later be shown with both a buy and a rent price.
Set rental_market_likely true only for formal, statement, or designer-tier
pieces; false for basics and low-price items. Add a short versatility_note
("versatile — you'd wear this again" / "one-off statement piece") as
information, never as a decision made for her. If she indicates, in any
wording, that she won't rent (or only wants to rent), set rental_preference
accordingly and keep it for the whole conversation without asking again.

## LEARNING — observe, never interrogate
Her picks teach you. Never ask "what's your style personality" or similar.
At most ONE follow_up_question per response, and only when genuinely needed
to proceed well (an unstated dress code for a formal event; a missing
location when weather truly matters). Ask nothing she has already answered.
When enough is known, follow_up_question is null and reply_text ends with a
natural next step instead.

## REPLY_TEXT
Open with one specific sentence tied to her occasion and its feel — never a
generic "Here's what I'd suggest". Wardrobe_only: present her own pieces
with warmth, then offer to look at buy/rent options too. Shop_new: introduce
the three directions briefly; products for the leading option are being
fetched — do not describe or invent specific retailer results in text.
If she asks a general style question rather than requesting an outfit
("what colours suit cool undertones?", "how do I style a white shirt?"),
answer it fully in reply_text with an empty outfit_options array — do not
force outfit options onto a question that doesn't want them.
Prices and market are UK (£). Keep it concise; the option cards carry the
detail.

## NEVER
Never invent wardrobe items or IDs. Never split one garment into several.
Never mention unconfirmed weather or GPS locations. Never ask more than one
question. Never re-ask anything. Never pad wardrobe results. Never choose
rent-vs-buy for her. Never present placeholder or "to be decided" items.`;

// -----------------------------------------------------------------------
// TOOL SCHEMA — provide_styling_response (v2)
// -----------------------------------------------------------------------
const provideStylingResponseTool = {
  type: "function",
  function: {
    name: "provide_styling_response",
    description:
      "Respond to the user with either wardrobe-only outfit options, or " +
      "newly-directed outfit concepts, depending on which mode fits the " +
      "conversation. Never include live product search results here — " +
      "that happens in a separate step after the user confirms interest.",
    parameters: {
      type: "object",
      required: ["mode", "outfit_options", "reply_text"],
      properties: {
        mode: {
          type: "string",
          enum: ["wardrobe_only", "shop_new"],
          description:
            "Which mode this response is in. wardrobe_only: user has a " +
            "wardrobe and nothing signals she wants new items — surface " +
            "genuinely fitting owned outfits only, no buy/rent. shop_new: " +
            "no wardrobe, wardrobe checked and nothing fit, or the user " +
            "indicated (in her own words, not a fixed phrase) that she " +
            "wants something new — always present exactly 3 varied options.",
        },
        styling_category: {
          type: "string",
          enum: ["womenswear", "menswear", "mixed"],
          description:
            "Defaults to womenswear (OutfitOracle is a women-focused " +
            "community). Override only when the user profile indicates " +
            "otherwise, the user states it, or the request clearly implies " +
            "it. Once set in a conversation, keep it — do not revert.",
        },
        wardrobe_check_result: {
          type: "string",
          enum: ["not_applicable", "matches_found", "no_matches"],
          description:
            "not_applicable: shop_new mode with no wardrobe to check. " +
            "matches_found: wardrobe_only mode succeeded. no_matches: a " +
            "wardrobe exists but nothing in it fit this occasion — Oracle " +
            "should say so plainly in reply_text and mode should be " +
            "shop_new for this response.",
        },
        outfit_options: {
          type: "array",
          description:
            "wardrobe_only mode: as many options as genuinely fit (0 to N, " +
            "no padding to a fixed count). shop_new mode: exactly 3, each " +
            "a genuinely different silhouette/colour/mood — not the same " +
            "outfit with one item swapped.",
          items: {
            type: "object",
            required: ["option_label", "items"],
            properties: {
              option_label: {
                type: "string",
                description:
                  "Short freeform description of this option's character " +
                  "(e.g. \"Emerald silk, from your wardrobe\" or \"Sleek " +
                  "column silhouette in champagne\"). NOT a fixed taxonomy " +
                  "— no forced classic/bold/minimalist labeling.",
              },
              is_primary: {
                type: "boolean",
                description:
                  "True for the option Oracle would lead with (strongest " +
                  "wardrobe match, or best fit to known/inferred taste). " +
                  "Exactly one true per response.",
              },
              items: {
                type: "array",
                description:
                  "The pieces making up this outfit. A dress/jumpsuit/ " +
                  "full outfit is ONE item with category dress or " +
                  "full_look — never split into fake separate top+bottom.",
                items: {
                  type: "object",
                  required: ["category", "name", "source", "reasoning"],
                  properties: {
                    category: {
                      type: "string",
                      enum: [
                        "dress",
                        "full_look",
                        "top",
                        "bottom",
                        "shoes",
                        "outerwear",
                        "accessory",
                      ],
                    },
                    name: {
                      type: "string",
                      description: "Specific, real, searchable item name.",
                    },
                    source: {
                      type: "string",
                      enum: ["from_wardrobe", "needs_purchase_or_rental"],
                      description:
                        "from_wardrobe requires wardrobe_item_id below. " +
                        "needs_purchase_or_rental means this item will get " +
                        "BOTH buy and rent options surfaced later where a " +
                        "rental market plausibly exists — Oracle does not " +
                        "pick one for the user.",
                    },
                    wardrobe_item_id: {
                      type: ["string", "null"],
                      description:
                        "REQUIRED (non-null) when source is from_wardrobe. " +
                        "Must be a real ID from the wardrobe list provided " +
                        "in context — never invented. Server validates this " +
                        "and downgrades to needs_purchase_or_rental on any " +
                        "mismatch.",
                    },
                    rental_market_likely: {
                      type: "boolean",
                      description:
                        "Only meaningful when source is " +
                        "needs_purchase_or_rental. True for formal/" +
                        "statement/designer-tier pieces where a rental " +
                        "search is worth running later. False for basics/ " +
                        "low-price items — skip rental search for these " +
                        "entirely, both for realism and cost.",
                    },
                    versatility_note: {
                      type: ["string", "null"],
                      description:
                        "One short framing line, e.g. \"versatile — you'd " +
                        "likely wear this again\" or \"a one-off statement " +
                        "piece\". Informational only — never a decision " +
                        "made on the user's behalf.",
                    },
                    reasoning: {
                      type: "string",
                      description:
                        "Why this item, for this person, this occasion. " +
                        "Should reference real signals when available — " +
                        "colour analysis best-colours, stated preferences, " +
                        "past liked items — not generic styling text.",
                    },
                    styling_tips: { type: "string" },
                  },
                },
              },
            },
          },
        },
        anchor_item_id: {
          type: ["string", "null"],
          description:
            "Set when this response is building around a specific " +
            "wardrobe item the user pinned (Phase 3 feature — schema " +
            "supports it now even though the UI entry point ships later). " +
            "When set, every option MUST include this exact item.",
        },
        rental_preference: {
          type: "string",
          enum: ["both", "buy_only", "rent_only"],
          description:
            "Sticky for the conversation. Defaults to both. Switches only " +
            "when the user says so in her own words at any point — track " +
            "this across turns via accumulated context, do not ask.",
        },
        reply_text: {
          type: "string",
          description:
            "The conversational message shown above the options. If " +
            "wardrobe_check_result is no_matches, say so plainly here. " +
            "End with an offer to find pieces to buy or rent for these " +
            "looks — do NOT run or describe search results yet; that is a " +
            "separate confirmed step.",
        },
        follow_up_question: {
          type: ["string", "null"],
          description:
            "At most one. Only when genuinely needed to proceed well — " +
            "never interrogating for style preference (that is learned " +
            "from picks, not asked). Null once enough context is known.",
        },
      },
    },
  },
};

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------
function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

async function callGateway(messages: unknown[]): Promise<Response> {
  return await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: [provideStylingResponseTool],
      tool_choice: {
        type: "function",
        function: { name: "provide_styling_response" },
      },
      max_tokens: 4000,
      temperature: 0.7,
    }),
  });
}

function parseToolCall(gatewayJson: any): any {
  const message = gatewayJson?.choices?.[0]?.message;
  const call = message?.tool_calls?.[0];
  if (!call || call.function?.name !== "provide_styling_response") {
    throw new Error("No provide_styling_response tool call in response");
  }
  const args = call.function.arguments;
  const parsed = typeof args === "string" ? JSON.parse(args) : args;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Tool arguments did not parse to an object");
  }
  if (!parsed.mode || !Array.isArray(parsed.outfit_options) || typeof parsed.reply_text !== "string") {
    throw new Error("Tool arguments missing required fields");
  }
  return parsed;
}

// -----------------------------------------------------------------------
// Product search helpers — ported UNCHANGED from generate-ai-recommendations
// -----------------------------------------------------------------------
const shopStyleApiKey = Deno.env.get('SHOPSTYLE_API_KEY');
const serperApiKey = Deno.env.get('SERPER_API_KEY');
const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

const isValidProductUrl = (url: string | null | undefined): boolean => {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;
  const blocked = [
    'google.com/shopping',
    'google.co.uk/shopping',
    'google.com/search',
    'googleapis.com',
    'javascript:'
  ];
  return !blocked.some(b => url.includes(b));
};

const extractRetailerUrl = (result: any): string | null => {
  if (isValidProductUrl(result.product_link)) return result.product_link;
  if (isValidProductUrl(result.merchant?.link)) return result.merchant.link;
  if (result.link && isValidProductUrl(result.link)) return result.link;
  return null;
};

const searchShopStyle = async (query: string, maxPrice: number): Promise<any[]> => {
  if (!shopStyleApiKey) return [];
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://api.shopstyle.com/api/v2/products?pid=${shopStyleApiKey}&fts=${encoded}&offset=0&limit=5&fl=p0:${maxPrice}&fl=d0:GB&fl=b0:GBP`;
    console.log(`[ShopStyle] Searching: "${query}" (max £${maxPrice})`);
    const response = await fetch(url);
    if (!response.ok) { console.warn('[ShopStyle] API error:', response.status); return []; }
    const data = await response.json();
    const products = (data.products || [])
      .map((p: any) => {
        const productUrl = extractRetailerUrl(p);
        return {
          retailer: p.retailer?.name || p.brand?.name || 'Retailer',
          product_name: p.name || p.brandedName || 'Product',
          price: p.priceLabel || (p.price ? `£${p.price}` : null),
          product_url: productUrl,
          image_url: p.image?.sizes?.Best?.url || p.image?.sizes?.Large?.url || p.image?.sizes?.Medium?.url || null,
          source: 'shopstyle',
        };
      })
      .filter((p: any) => p.product_url);
    console.log(`[ShopStyle] Found ${products.length} products for "${query}"`);
    return products;
  } catch (err) { console.warn('[ShopStyle] Error:', err); return []; }
};

const searchGoogleShopping = async (query: string, maxPrice: number): Promise<any[]> => {
  if (!serperApiKey) return [];
  try {
    console.log(`[Serper] Searching Google Shopping: "${query}"`);
    const response = await fetch('https://google.serper.dev/shopping', {
      method: 'POST',
      headers: { 'X-API-KEY': serperApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl: 'gb', hl: 'en', num: 8 }),
    });
    if (!response.ok) { console.warn('[Serper] API error:', response.status); return []; }
    const data = await response.json();
    const results = (data.shopping || [])
      .map((r: any) => {
        const priceStr = r.price || '';
        const cleaned = priceStr.replace(/[^0-9.,]/g, '').replace(',', '.');
        const numericPrice = parseFloat(cleaned);
        const productUrl = extractRetailerUrl(r);
        return {
          retailer: r.source || 'Retailer',
          product_name: r.title || 'Product',
          price: !isNaN(numericPrice) ? `£${numericPrice.toFixed(2)}` : (priceStr || null),
          numericPrice: !isNaN(numericPrice) ? numericPrice : null,
          product_url: productUrl,
          image_url: r.imageUrl || null,
          source: 'google_shopping',
        };
      })
      .filter((r: any) => r.product_url && (r.numericPrice === null || r.numericPrice <= maxPrice))
      .slice(0, 5)
      .map(({ numericPrice, ...rest }: any) => rest);
    console.log(`[Serper] Found ${results.length} products for "${query}"`);
    return results;
  } catch (err) { console.warn('[Serper] Error:', err); return []; }
};

type RetailerTarget = { name: string; domain: string; searchUrl: (encoded: string) => string };

const BUY_RETAILERS_BY_TIER: Record<string, RetailerTarget[]> = {
  budget: [
    { name: 'ASOS', domain: 'asos.com', searchUrl: (q) => `https://www.asos.com/search/?q=${q}` },
    { name: 'H&M', domain: 'hm.com', searchUrl: (q) => `https://www2.hm.com/en_gb/search-results.html?q=${q}` },
    { name: 'Zara', domain: 'zara.com', searchUrl: (q) => `https://www.zara.com/uk/en/search?searchTerm=${q}` },
  ],
  mid_range: [
    { name: 'John Lewis', domain: 'johnlewis.com', searchUrl: (q) => `https://www.johnlewis.com/search?search-term=${q}` },
    { name: 'Marks and Spencer', domain: 'marksandspencer.com', searchUrl: (q) => `https://www.marksandspencer.com/MSFindItemsByKeyword?searchTerm=${q}` },
    { name: 'Reiss', domain: 'reiss.com', searchUrl: (q) => `https://www.reiss.com/uk/search?w=${q}` },
    { name: 'Selfridges', domain: 'selfridges.com', searchUrl: (q) => `https://www.selfridges.com/GB/en/cat/?freeText=${q}` },
  ],
  luxury: [
    { name: 'Net-a-Porter', domain: 'net-a-porter.com', searchUrl: (q) => `https://www.net-a-porter.com/en-gb/shop/search/${q}` },
    { name: 'Selfridges', domain: 'selfridges.com', searchUrl: (q) => `https://www.selfridges.com/GB/en/cat/?freeText=${q}` },
    { name: 'Harrods', domain: 'harrods.com', searchUrl: (q) => `https://www.harrods.com/en-gb/search?query=${q}` },
  ],
};

const buildSearchUrls = (query: string, tier: string): any[] => {
  const encoded = encodeURIComponent(query);
  const retailers = BUY_RETAILERS_BY_TIER[tier] || BUY_RETAILERS_BY_TIER.mid_range;
  return retailers.map(r => ({
    retailer: r.name,
    product_name: `Browse ${r.name} for "${query}"`,
    price: null,
    product_url: r.searchUrl(encoded),
    image_url: null,
    source: 'retailer_search',
  }));
};

const buildRentalSearchUrls = (query: string): any[] => {
  const encoded = encodeURIComponent(query);
  const platforms = [
    { name: 'HURR', url: `https://www.hurr.com/search?query=${encoded}` },
    { name: 'By Rotation', url: `https://byrotation.com/search?q=${encoded}` },
    { name: 'My Wardrobe HQ', url: `https://www.mywardrobehq.com/search?q=${encoded}` },
  ];
  return platforms.map(p => ({
    platform: p.name,
    product_name: `Browse ${p.name} for "${query}"`,
    price: null,
    product_url: p.url,
    image_url: null,
    type: 'rental',
    source: 'rental_search',
  }));
};

const searchFirecrawlPlatform = async (query: string, platform: { name: string; domain: string }, type: 'rental' | 'secondhand'): Promise<any> => {
  if (!firecrawlApiKey) return null;
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${firecrawlApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `${query} site:${platform.domain}`, limit: 1, scrapeOptions: { formats: ['markdown'] } }),
    });
    if (!response.ok) return null;
    const searchData = await response.json();
    const result = (searchData?.data || [])[0];
    if (!result) return null;
    const markdown = result.markdown || '';
    const imageUrl = result.metadata?.ogImage || result.metadata?.image || null;
    if (type === 'rental') {
      const rentalPriceMatch = markdown.match(/£[\d,]+(?:\.\d{2})?\s*(?:\/\s*day|per\s*day|per\s*occasion|to\s*rent)/i)
        || markdown.match(/(?:rent|rental|from)\s*£[\d,]+(?:\.\d{2})?/i)
        || markdown.match(/£[\d,]+(?:\.\d{2})?/);
      return { platform: platform.name, product_name: result.title || result.metadata?.title || 'Unknown product', price: rentalPriceMatch ? rentalPriceMatch[0] : null, product_url: result.url || '', image_url: imageUrl, type: 'rental', source: 'firecrawl' };
    } else {
      const priceMatch = markdown.match(/£[\d,]+(?:\.\d{2})?/);
      const conditionMatch = markdown.match(/(?:condition|quality)[:\s]*(excellent|very good|good|fair|new with tags|like new|pristine)/i);
      const condition = conditionMatch ? conditionMatch[1] : markdown.match(/\b(excellent|pristine|like new|new with tags)\b/i) ? 'excellent' : markdown.match(/\b(very good|great condition)\b/i) ? 'good' : null;
      return { platform: platform.name, product_name: result.title || result.metadata?.title || 'Unknown product', price: priceMatch ? priceMatch[0] : null, product_url: result.url || '', image_url: imageUrl, condition: condition || 'good', type: 'secondhand', source: 'firecrawl' };
    }
  } catch (err) { return null; }
};

const PRIORITY_FASHION_RETAILERS = [
  'ASOS', 'Zara', 'H&M', 'Net-a-Porter', 'Reiss', 'Mango',
  'Other Stories', 'Whistles', 'Phase Eight', 'Ghost', 'Monsoon',
  'John Lewis', 'Marks and Spencer', 'COS', 'Selfridges', 'Matches Fashion'
];

const prioritizeRetailers = (results: any[]): any[] => {
  const fashion = results.filter((r: any) =>
    PRIORITY_FASHION_RETAILERS.some(retailer =>
      r.retailer?.toLowerCase().includes(retailer.toLowerCase())
    )
  );
  const other = results.filter((r: any) =>
    !PRIORITY_FASHION_RETAILERS.some(retailer =>
      r.retailer?.toLowerCase().includes(retailer.toLowerCase())
    )
  );
  return [...fashion, ...other];
};

const SEARCH_CACHE_VERSION = 'oracle-product-search-v4';

const normalizeImageUrl = (url: string | null | undefined): string | null => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (!trimmed.startsWith('http')) return null;
  return trimmed;
};

const normalizeUrlForDedupe = (url: string): string => {
  try {
    const u = new URL(url);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'].forEach((p) => u.searchParams.delete(p));
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch (_) {
    return url;
  }
};

const isGoogleSearchFallback = (result: any): boolean => {
  const url = String(result?.product_url || '');
  return url.includes('google.com/search') || url.includes('google.co.uk/search');
};

const productScore = (result: any): number => {
  let score = 0;
  if (result?.source === 'google_shopping' || result?.source === 'shopstyle') score += 6;
  if (result?.source === 'firecrawl') score += 4;
  if (result?.image_url) score += 3;
  if (result?.price) score += 2;
  if (result?.source === 'retailer_search' || result?.source === 'rental_search') score -= 4;
  return score;
};

const cleanProductResults = (results: any[], limit: number): any[] => {
  const seen = new Set<string>();
  return results
    .filter((r: any) => r && isValidProductUrl(r.product_url) && !isGoogleSearchFallback(r))
    .map((r: any) => ({ ...r, image_url: normalizeImageUrl(r.image_url) }))
    .sort((a: any, b: any) => productScore(b) - productScore(a))
    .filter((r: any) => {
      const key = normalizeUrlForDedupe(r.product_url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
};

const buildProductQueryVariants = (query: string): string[] => {
  const cleaned = query
    .replace(/\b(floor[-\s]?length|full[-\s]?length|architectural|statement|modern|sleek|luminous|perfect|versatile)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lower = cleaned.toLowerCase();
  const colours = ['black', 'navy', 'midnight navy', 'emerald', 'green', 'champagne', 'ivory', 'white', 'red', 'burgundy', 'pink', 'silver', 'gold', 'cream'];
  const fabrics = ['silk', 'satin', 'velvet', 'crepe', 'lace', 'chiffon'];
  const garments = ['gown', 'dress', 'jumpsuit', 'suit', 'blazer', 'trousers', 'skirt', 'coat', 'heels', 'sandals', 'clutch', 'bag'];
  const colour = colours.find((c) => lower.includes(c));
  const fabric = fabrics.find((f) => lower.includes(f));
  const garment = garments.find((g) => lower.includes(g));

  const variants = [
    query.trim(),
    cleaned,
    [colour, fabric, garment].filter(Boolean).join(' '),
    [colour, garment].filter(Boolean).join(' '),
    [fabric, garment].filter(Boolean).join(' '),
    garment === 'gown' || garment === 'dress' ? `evening ${garment}` : garment || '',
  ];

  return Array.from(new Set(variants.map((v) => v.trim()).filter(Boolean))).slice(0, 5);
};

const searchFirecrawlRetailer = async (query: string, retailer: RetailerTarget): Promise<any | null> => {
  if (!firecrawlApiKey) return null;
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${firecrawlApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `${query} site:${retailer.domain}`, limit: 1, scrapeOptions: { formats: ['markdown'] } }),
    });
    if (!response.ok) return null;
    const searchData = await response.json();
    const result = (searchData?.data || [])[0];
    if (!result || !isValidProductUrl(result.url)) return null;
    const markdown = result.markdown || '';
    const priceMatch = markdown.match(/£[\d,]+(?:\.\d{2})?/);
    return {
      retailer: retailer.name,
      product_name: result.title || result.metadata?.title || `Result from ${retailer.name}`,
      price: priceMatch ? priceMatch[0] : null,
      product_url: result.url,
      image_url: result.metadata?.ogImage || result.metadata?.image || null,
      source: 'firecrawl',
    };
  } catch (_) {
    return null;
  }
};

const searchSerperRetailer = async (query: string, retailer: RetailerTarget): Promise<any | null> => {
  if (!serperApiKey) return null;
  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': serperApiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: `${query} site:${retailer.domain}`, gl: 'gb', hl: 'en', num: 3 }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const result = (data.organic || []).find((r: any) => isValidProductUrl(r.link));
    if (!result) return null;
    const priceMatch = `${result.title || ''} ${result.snippet || ''}`.match(/£[\d,]+(?:\.\d{2})?/);
    return {
      retailer: retailer.name,
      product_name: result.title || `Result from ${retailer.name}`,
      price: priceMatch ? priceMatch[0] : null,
      product_url: result.link,
      image_url: result.imageUrl || result.thumbnail || null,
      source: 'serper_web',
    };
  } catch (_) {
    return null;
  }
};

// -----------------------------------------------------------------------
// Search policy — buy always (unless rent_only), rent only when the item's
// rental_market_likely is true AND rental_preference allows it. Every
// external call passes through a 24h search_cache keyed by
// lower(trim(query)) + '|' + price_tier + '|' + kind.
// -----------------------------------------------------------------------
const RENTAL_PLATFORMS = [
  { name: 'HURR', domain: 'hurr.com' },
  { name: 'By Rotation', domain: 'byrotation.com' },
  { name: 'My Wardrobe HQ', domain: 'mywardrobehq.com' },
];

const priceTierMax = (tier: string): number =>
  tier === 'budget' ? 100 : tier === 'luxury' ? 2000 : 300;

async function cachedSearch(
  supabase: any,
  query: string,
  tier: string,
  kind: 'buy' | 'rent',
  run: () => Promise<any[]>,
): Promise<any[]> {
  const key = `${SEARCH_CACHE_VERSION}|${query.trim().toLowerCase()}|${tier}|${kind}`;
  try {
    const { data } = await supabase
      .from('search_cache')
      .select('results, created_at')
      .eq('query_key', key)
      .maybeSingle();
    if (data?.created_at && Array.isArray(data.results)) {
      const ageMs = Date.now() - new Date(data.created_at).getTime();
        if (ageMs < 24 * 3600 * 1000) return cleanProductResults(data.results as any[], kind === 'buy' ? 4 : 2);
    }
  } catch (_) { /* cache miss on error */ }
  const results = await run();
  try {
    await supabase
      .from('search_cache')
      .upsert(
        { query_key: key, results, created_at: new Date().toISOString() },
        { onConflict: 'query_key' },
      );
  } catch (_) { /* non-fatal */ }
  return results;
}

async function runBuySearch(query: string, tier: string): Promise<any[]> {
  const maxPrice = priceTierMax(tier);
  const variants = buildProductQueryVariants(query);
  let gathered: any[] = [];

  for (const variant of variants) {
    const [g, s] = await Promise.all([
      searchGoogleShopping(variant, maxPrice),
      searchShopStyle(variant, maxPrice),
    ]);
    gathered = cleanProductResults(prioritizeRetailers([...gathered, ...g, ...s]), 8);
    if (gathered.length >= 4) break;
  }

  let realResults = cleanProductResults(prioritizeRetailers(gathered), 4);
  if (realResults.length < 3) {
    const retailerPool = (BUY_RETAILERS_BY_TIER[tier] || BUY_RETAILERS_BY_TIER.mid_range).slice(0, 4);
    const [webResults, firecrawlResults] = await Promise.all([
      Promise.all(retailerPool.map((r) => searchSerperRetailer(variants[1] || query, r))),
      Promise.all(retailerPool.map((r) => searchFirecrawlRetailer(variants[1] || query, r))),
    ]);
    realResults = cleanProductResults(
      prioritizeRetailers([...realResults, ...webResults.filter(Boolean), ...firecrawlResults.filter(Boolean)]),
      4,
    );
  }

  return realResults.length > 0 ? realResults : cleanProductResults(buildSearchUrls(query, tier), 4);
}

async function runRentSearch(query: string): Promise<any[]> {
  const settled = await Promise.all(
    RENTAL_PLATFORMS.map((p) => searchFirecrawlPlatform(query, p, 'rental')),
  );
  const found = settled.filter((r) => r).slice(0, 2);
  return found.length > 0 ? cleanProductResults(found, 2) : cleanProductResults(buildRentalSearchUrls(query), 2);
}

async function searchItemsForOption(
  supabase: any,
  items: any[],
  rentalPreference: string | undefined,
  stylingCategory: string | undefined,
): Promise<any[]> {
  const prefix = stylingCategory === 'menswear' ? "men's " : '';
  return await Promise.all(
    items.map(async (item: any) => {
      const baseQuery = `${prefix}${item?.name ?? ''}`.trim();
      const tier = item?.price_tier || 'mid_range';
      const wantBuy = rentalPreference !== 'rent_only';
      const wantRent =
        rentalPreference !== 'buy_only' && item?.rental_market_likely === true;
      const [buy, rent] = await Promise.all([
        wantBuy && baseQuery
          ? cachedSearch(supabase, baseQuery, tier, 'buy', () => runBuySearch(baseQuery, tier))
          : Promise.resolve([]),
        wantRent && baseQuery
          ? cachedSearch(supabase, baseQuery, tier, 'rent', () => runRentSearch(baseQuery))
          : Promise.resolve([]),
      ]);
      return { ...item, buy, rent };
    }),
  );
}

// -----------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method_not_allowed" }, 405);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth (optional — guests permitted, IP rate limited)
    const authHeader = req.headers.get("Authorization");
    let user: { id: string; email?: string } | null = null;

    if (authHeader) {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser(
          authHeader.replace("Bearer ", ""),
        );
        if (authUser) user = { id: authUser.id, email: authUser.email ?? undefined };
      } catch (_) {
        // fall through as guest
      }
    }

    // Guest IP rate limiting — mirrors generate-ai-recommendations
    if (!user) {
      const forwarded = req.headers.get("x-forwarded-for") || "";
      const guestIp = forwarded.split(",")[0]?.trim() || "unknown";
      const { data: guestLimit, error: guestLimitError } = await supabase.rpc(
        "check_guest_rate_limit",
        { ip_param: guestIp, daily_limit: 5 },
      );
      if (guestLimitError) {
        console.error("Guest rate limit check error:", guestLimitError);
      }
      if (guestLimit && guestLimit.allowed === false) {
        return jsonResponse(req, {
          error: "Rate limit exceeded",
          message: "You've reached the daily limit for guests. Sign up to continue getting styling advice.",
        }, 429);
      }
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    // Handle record_selection action — short-circuits the AI flow.
    // Authenticated: insert into option_selections. Guests: no-op (no user_id
    // to attach to), still respond with the same shape so the client treats it
    // uniformly.
    if (action === "record_selection") {
      const { option_label, option_traits, conversation_hint } = body ?? {};
      if (typeof option_label !== "string" || !option_label.trim()) {
        return jsonResponse(req, { error: "option_label is required" }, 400);
      }
      if (user) {
        const { error: insertError } = await supabase.from("option_selections").insert({
          user_id: user.id,
          option_label: option_label.trim(),
          option_traits: option_traits ?? null,
          conversation_hint: conversation_hint ?? null,
        });
        if (insertError) {
          console.error("option_selections insert failed:", insertError);
          return jsonResponse(req, { error: "selection_record_failed" }, 500);
        }
      }
      return jsonResponse(req, { ok: true });
    }

    // Handle search_option action — the tap-to-load path for non-primary
    // options. Runs the same buy/rent policy for the passed items and
    // returns them with { buy, rent } attached.
    if (action === "search_option") {
      const { option_label, items_to_search, rental_preference, styling_category } = body ?? {};
      if (typeof option_label !== "string" || !option_label.trim()) {
        return jsonResponse(req, { error: "option_label is required" }, 400);
      }
      if (!Array.isArray(items_to_search)) {
        return jsonResponse(req, { error: "items_to_search must be an array" }, 400);
      }
      const nonWardrobe = items_to_search.filter(
        (i: any) => i?.source !== "from_wardrobe",
      );
      const searched = await searchItemsForOption(
        supabase,
        nonWardrobe,
        typeof rental_preference === "string" ? rental_preference : undefined,
        typeof styling_category === "string" ? styling_category : undefined,
      );
      return jsonResponse(req, { ok: true, option_label, items: searched });
    }


    const {
      user_message: userMessageSnake,
      message: userMessageCamel,
      conversation_history: conversationHistorySnake,
      conversationHistory: conversationHistoryCamel,
      accumulated_context = null,
      anchor_item_id = null,
      weather_context: weatherContextSnake,
      weatherData: weatherContextCamel,
      venue_context: venueContextSnake,
      venueContext: venueContextCamel,
      event_context: eventContextSnake,
      eventContext: eventContextCamel,
    } = body ?? {};

    const user_message = typeof userMessageSnake === "string" ? userMessageSnake : userMessageCamel;
    const conversation_history = Array.isArray(conversationHistorySnake)
      ? conversationHistorySnake
      : conversationHistoryCamel;
    const weather_context = weatherContextSnake ?? weatherContextCamel ?? null;
    const venue_context = venueContextSnake ?? venueContextCamel ?? null;
    const event_context = eventContextSnake ?? eventContextCamel ?? null;

    if (typeof user_message !== "string" || !user_message.trim()) {
      return jsonResponse(req, { error: "user_message is required" }, 400);
    }

    // Parallel context fetches for authenticated users
    let styleProfile: any = null;
    let wardrobeItems: any[] = [];
    let preferenceInsights: any[] = [];
    let recentFeedback: any[] = [];
    let recentSelections: any[] = [];

    if (user) {
      const [profileRes, wardrobeRes, insightsRes, feedbackRes, selectionsRes] = await Promise.all([
        supabase
          .from("user_style_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("wardrobe_items")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(75),
        supabase
          .from("user_preference_insights")
          .select("*")
          .eq("user_id", user.id)
          .order("confidence_score", { ascending: false })
          .limit(10),
        supabase
          .from("recommendation_feedback")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("option_selections")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      styleProfile = profileRes.data ?? null;
      wardrobeItems = wardrobeRes.data ?? [];
      preferenceInsights = insightsRes.data ?? [];
      recentFeedback = feedbackRes.data ?? [];
      recentSelections = selectionsRes.data ?? [];
    }

    // Assemble the context block for the model
    const contextPayload = {
      user: user ? { authenticated: true } : { guest: true },
      style_profile: styleProfile,
      wardrobe_items: wardrobeItems.map((w) => ({
        id: w.id,
        name: w.name,
        category: w.category,
        colour: w.colour ?? w.color ?? null,
        brand: w.brand ?? null,
        image_url: w.image_url ?? null,
        tags: w.tags ?? null,
      })),
      preference_insights: preferenceInsights,
      recent_feedback: recentFeedback,
      recent_option_selections: recentSelections,
      accumulated_context,
      anchor_item_id,
      weather_context,
      venue_context,
      event_context,
    };

    const historyMessages = Array.isArray(conversation_history)
      ? conversation_history
          .filter((m: any) =>
            m &&
            typeof m.role === "string" &&
            typeof m.content === "string" &&
            (m.role === "user" || m.role === "assistant")
          )
          .slice(-20)
          .map((m: any) => ({ role: m.role, content: m.content }))
      : [];

    const messages = [
      { role: "system", content: ORACLE_SYSTEM_PROMPT },
      {
        role: "system",
        content:
          "CONTEXT (JSON — treat as real signals, not decoration):\n" +
          JSON.stringify(contextPayload),
      },
      ...historyMessages,
      { role: "user", content: user_message },
    ];

    // Call gateway with one retry on tool-call parse failure. No fallback.
    let parsed: any | null = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      let gatewayResp: Response;
      try {
        gatewayResp = await callGateway(messages);
      } catch (err) {
        lastError = err;
        console.error(`Oracle gateway call failed (attempt ${attempt + 1}):`, err);
        continue;
      }

      if (gatewayResp.status === 429 || gatewayResp.status === 402) {
        const text = await gatewayResp.text().catch(() => "");
        console.error("Gateway rate/credit failure:", gatewayResp.status, text);
        return jsonResponse(
          req,
          {
            error: gatewayResp.status === 402 ? "credits_exhausted" : "rate_limited",
            message: gatewayResp.status === 402
              ? "AI credits exhausted. Please top up in workspace settings."
              : "Too many requests to the AI gateway. Please try again shortly.",
          },
          gatewayResp.status,
        );
      }

      if (!gatewayResp.ok) {
        lastError = new Error(`Gateway HTTP ${gatewayResp.status}`);
        console.error("Gateway non-OK response:", gatewayResp.status, await gatewayResp.text().catch(() => ""));
        continue;
      }

      const gatewayJson = await gatewayResp.json().catch((e) => {
        lastError = e;
        return null;
      });
      if (!gatewayJson) continue;

      try {
        parsed = parseToolCall(gatewayJson);
        break;
      } catch (err) {
        lastError = err;
        console.error(`Tool-call parse failure (attempt ${attempt + 1}):`, err);
      }
    }

    if (!parsed) {
      console.error("Oracle generation failed after retry:", lastError);
      return jsonResponse(req, { error: "generation_failed" }, 502);
    }

    // Server-side wardrobe_item_id validation:
    // - Guests (no user) and users with an empty wardrobe: every from_wardrobe
    //   item is downgraded — the AI cannot legitimately pick from what we did
    //   not load.
    // - Otherwise: wardrobe_item_id must be non-null AND present in the loaded
    //   wardrobe. Anything else is an invention by the model.
    // - On downgrade: log a warning with the item's name so we can audit
    //   hallucinations.
    const validIds = new Set(wardrobeItems.map((w) => String(w.id)));
    const forceDowngrade = !user || wardrobeItems.length === 0;
    if (Array.isArray(parsed.outfit_options)) {
      for (const opt of parsed.outfit_options) {
        if (!Array.isArray(opt?.items)) continue;
        for (const item of opt.items) {
          if (item?.source !== "from_wardrobe") continue;
          const idValid =
            item.wardrobe_item_id != null &&
            validIds.has(String(item.wardrobe_item_id));
          if (forceDowngrade || !idValid) {
            const reason = forceDowngrade
              ? `no wardrobe in scope (user=${!!user}, items=${wardrobeItems.length})`
              : `wardrobe_item_id missing or not in user's wardrobe`;
            console.warn(
              `Wardrobe validation: downgrading "${item?.name ?? "(unnamed)"}" — ${reason}`,
            );
            item.source = "needs_purchase_or_rental";
            item.wardrobe_item_id = null;
          }
        }
      }
    }

    // shop_new mode: auto-run product search for the primary option's
    // non-wardrobe items and attach { buy, rent } directly to each item.
    // Other options load on tap via the search_option action above.
    if (parsed.mode === "shop_new" && Array.isArray(parsed.outfit_options)) {
      const primary = parsed.outfit_options.find((o: any) => o?.is_primary === true);
      if (primary && Array.isArray(primary.items)) {
        const nonWardrobe = primary.items.filter(
          (i: any) => i?.source !== "from_wardrobe",
        );
        if (nonWardrobe.length > 0) {
          try {
            const searched = await searchItemsForOption(
              supabase,
              nonWardrobe,
              typeof parsed.rental_preference === "string" ? parsed.rental_preference : undefined,
              typeof parsed.styling_category === "string" ? parsed.styling_category : undefined,
            );
            const byName = new Map(searched.map((s: any) => [s.name, s]));
            primary.items = primary.items.map((it: any) => {
              if (it?.source === "from_wardrobe") return it;
              const enriched = byName.get(it?.name);
              return enriched ? { ...it, buy: enriched.buy, rent: enriched.rent } : it;
            });
          } catch (err) {
            console.error("Primary-option search failed (non-fatal):", err);
          }
        }
      }
    }

    return jsonResponse(req, { success: true, data: parsed });
  } catch (err) {
    console.error("Oracle-styling unexpected error:", err);
    return jsonResponse(req, { error: "generation_failed" }, 502);
  }
});
