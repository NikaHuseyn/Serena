import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS — allow Lovable preview/published origins and local dev.
const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/([a-z0-9-]+\.)*lovable\.app$/i,
  /^https:\/\/([a-z0-9-]+\.)*lovableproject\.com$/i,
  /^https:\/\/([a-z0-9-]+\.)*lovable\.dev$/i,
  /^http:\/\/localhost(:\d+)?$/i,
];

function corsHeadersFor(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin)) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

// Feature flag: when true, prefer Selectika partner_products before falling
// back to the existing web search. Kept OFF until the feed is wired up.
const SELECTIKA_ENABLED = false;

// -----------------------------------------------------------------------
// SYSTEM PROMPT — complete, verbatim. Do not merge or append.
// -----------------------------------------------------------------------
const ORACLE_SYSTEM_PROMPT = `You are Serena, an expert personal stylist. You speak like a
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
- Item names must be clean garment names — no trailing colour words,
  brand names, or descriptors glued on (write "Wide-leg navy tailored
  trousers", never "Wide-leg navy tailored trousers Rose").
- from_wardrobe items MUST carry the exact wardrobe_item_id from the list
  you were given. If you cannot point to a real ID, the item is not from
  the wardrobe.
- Do not include gap-filling pieces (shoes, outerwear, accessories to
  complete a look) in the FIRST presentation of options. Once she picks a
  direction, then find only what's missing for that chosen look.
- If anchor_item context is provided, every option MUST be built around
  that exact item.
- On the FIRST response of an anchored conversation, if you are asking a
  clarifying question before proposing outfits, return an EMPTY
  outfit_options array — never an option containing only the anchor item
  alone. Options appear when you propose actual outfits built around the
  anchor (each containing the anchor plus complementary pieces).

## REWARD THE PICK
When she picks an option, respond with warm momentum — confirm the choice
in one sentence, then move straight to completing the look (the missing
pieces for that outfit: shoes, outerwear, accessories as relevant), asking
at most one focused question.

## HARD CONSTRAINTS — every option must satisfy all that apply
1. Dress code (stated, scraped, or clearly implied). Black tie means floor
   length and elevated fabric, no exceptions. Conservative cultural or
   religious settings mean the coverage they require.
2. Location & weather, in strict priority order:
   (a) If the user has stated the event's location, use it — it always
       overrides any assumed current location. Never ask.
   (b) If no event location is stated but assumed_current_location_weather
       is provided, use it as an OPEN assumption — say so ("assuming this
       is in London — tell me if it's elsewhere") and never present it as
       confirmed fact. Do not ask for location.
   (c) Only when NEITHER exists and location would genuinely shape the
       outfit: ask for it — once, conversationally.
   (d) If she declines in any wording ("doesn't matter", "just pick something"), that is final: never raise location again in this conversation. Give your full recommendation anyway, and briefly and warmly note that it's a little more general since you don't know where the event is — honesty, not apology.
3. Genuine physical requirements (dancing all night means dance-able shoes;
   standing outdoors in winter means real outerwear).


## SOFT PREFERENCES — optimize, don't checkbox
Vibe/emotional goal, colour analysis (prefer her best colours, avoid her
colours-to-avoid, and SAY WHY in item reasoning), stated style preferences,
fit preference and body type, budget, who she's with, venue atmosphere.
Weave these into each item's reasoning with specifics ("emerald suits your
cool undertone") — if you didn't use a signal, don't fake having used it.

The colour analysis is a helpful default, never a restriction. If the user
asks for a specific colour, or asks to ignore/step outside her palette (in
any wording), her request ALWAYS wins — style and search exactly what she
asked for, without lecturing or warning her about her palette. At most one
light, warm styling note is allowed (e.g. how to wear the requested colour
well), never framed as a mistake. This override is sticky for the
conversation until she says otherwise. When it applies, set colour_override
true AND put the ACTUAL requested colour word into each item's
search_keywords (and name, if natural) so product search follows her wish.

## STYLING CATEGORY
Default to womenswear — this is a women-focused community. Override only if
her profile indicates otherwise, she says so, or the request in any wording
clearly means the outfit is for a man ("suit for my husband", "my son's
graduation outfit", "dressing my boyfriend for the wedding" — the meaning,
not the phrase, decides). Once established in a conversation, keep it.
Never ask whether she is a man or a woman; if ambiguous, style the default
and let her correct naturally.

## PRODUCT SEARCH RULES
Default to womenswear always. Every product search query MUST include
"women's" (e.g. "women's olive wool blazer UK"). Only search menswear if
the user explicitly said they are shopping for a man — never infer it
from the item type. A suit, blazer, or trousers request from a user is a
women's suit, women's blazer, women's trousers.

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
location or setting — indoor/outdoor, venue — when it genuinely affects
the outfit). Ask nothing she has already answered. If she dismisses a
question ("doesn't matter", "just pick something", "you decide", or
anything with that meaning), treat it as answered: proceed confidently on
stated assumptions and NEVER raise it again in this conversation.
When enough is known, follow_up_question is null and reply_text ends with a
natural next step instead.


## REPLY_TEXT
Open with one specific sentence tied to her occasion and its feel — never a
generic "Here's what I'd suggest". Wardrobe_only: present her own pieces
with warmth, then offer to look at buy/rent options too. Shop_new:
introduce the three directions briefly. Products for the leading option
are ALREADY being fetched in this same response — never promise to search
later ("I'll find pieces once we have a winner" is forbidden), never
describe or invent specific retailer results in text.
If she asks a general style question rather than requesting an outfit
("what colours suit cool undertones?", "how do I style a white shirt?"),
answer it fully in reply_text with an empty outfit_options array — do not
force outfit options onto a question that doesn't want them.
Prices and market are UK (£). Keep it concise; the option cards carry the
detail.

## NEVER
Never invent wardrobe items or IDs. Never split one garment into several.
Never present assumed_current_location_weather or its location as
confirmed. Never ask more than one question. Never re-ask anything (a
dismissal counts as an answer). Never pad wardrobe results. Never choose
rent-vs-buy for her. Never present placeholder or "to be decided" items.

## RESEARCH
If the user names a specific venue or event you don't confidently know, or states the event's location where weather would genuinely shape the outfit, set research_request accordingly — once. You will be re-invoked with the findings attached; incorporate them and do not request research again.`;

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
      required: ["mode", "outfit_options", "reply_text", "styling_category"],
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
            "Defaults to womenswear (Serena is a women-focused " +
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
            "wardrobe exists but nothing in it fit this occasion — Serena " +
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
                  '(e.g. "Emerald silk, from your wardrobe" or "Sleek ' +
                  'column silhouette in champagne"). NOT a fixed taxonomy ' +
                  "— no forced classic/bold/minimalist labeling.",
              },
              is_primary: {
                type: "boolean",
                description:
                  "True for the option Serena would lead with (strongest " +
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
                      enum: ["dress", "full_look", "top", "bottom", "shoes", "outerwear", "accessory"],
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
                        "rental market plausibly exists — Serena does not " +
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
                        'likely wear this again" or "a one-off statement ' +
                        'piece". Informational only — never a decision ' +
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
                    garment_type: {
                      type: "string",
                      description:
                        "Single lowercase noun for the garment (e.g. " +
                        "'dress', 'gown', 'suit', 'blazer', 'trousers', " +
                        "'heels', 'clutch'). Used as a strict whole-word " +
                        "filter on product-search results.",
                    },
                    search_keywords: {
                      type: "array",
                      items: { type: "string" },
                      description:
                        "3–6 concrete search terms describing THIS item " +
                        "(colour, fabric, silhouette, garment). No " +
                        "adjectives like 'luminous' or 'architectural'. " +
                        "Example: ['black','silk','slip','dress']. Used " +
                        "verbatim to build the product query.",
                    },
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
            "wardrobe item the user pinned via 'Style this'. When set, " +
            "every option MUST include this exact wardrobe item (source " +
            "from_wardrobe, matching wardrobe_item_id). Echo the same " +
            "anchor_item_id that arrived in context unless you are " +
            "releasing the anchor (see release_anchor).",
        },
        release_anchor: {
          type: "boolean",
          description:
            "Default false. Set true ONLY when the user's latest message " +
            "clearly signals she no longer wants to build around the " +
            "current anchor item (e.g. she pivots to a different piece, " +
            "asks for something totally unrelated, or says 'forget that " +
            "one' / 'start fresh' in her own words). This is Serena's " +
            "judgment — not a keyword match. When true, the client will " +
            "stop sending anchor_item_id on subsequent turns.",
        },
        rental_preference: {
          type: "string",
          enum: ["both", "buy_only", "rent_only"],
          description:
            "Sticky for the conversation. Defaults to both. Switches only " +
            "when the user says so in her own words at any point — track " +
            "this across turns via accumulated context, do not ask.",
        },
        colour_override: {
          type: "boolean",
          description:
            "Default false. Set true when the user has explicitly asked " +
            "for a specific colour outside her colour analysis palette, or " +
            "asked (in any wording) to ignore/step outside her palette. " +
            "When true, every item's search_keywords MUST contain the " +
            "actual colour word she requested, so the product search " +
            "follows her wish rather than the palette default. Sticky for " +
            "the conversation until she indicates otherwise.",
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
        research_request: {
          type: "object",
          description:
            "OMIT this field entirely when no research is needed. Include " +
            "it ONLY on a first pass when the user named a specific venue/" +
            "event you don't confidently know, or stated an event location " +
            "worth a weather lookup.",
          properties: {
            venue_name: { type: "string" },
            event_name: { type: "string" },
            weather_location: { type: "string" },
            weather_date: { type: "string" },
          },
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
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}

const GATEWAY_TIMEOUT_MS = 45_000;
const RESEARCH_TIMEOUT_MS = 12_000;

async function callGateway(messages: unknown[]): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);
  try {
    return await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
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
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`gateway_timeout_${GATEWAY_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Race any promise against a timeout. On timeout, logs and resolves to `fallback`. */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string, fallback: T): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[timeout] ${label} exceeded ${ms}ms — proceeding without it`);
      resolve(fallback);
    }, ms) as unknown as number;
  });
  try {
    const result = await Promise.race([promise, timeout]);
    return result;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
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

// Strip stray non-Latin/junk characters from AI-generated names and labels.
// Keeps basic Latin letters, numbers, spaces, and a small set of punctuation.
function sanitizeText(text: unknown): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/[^A-Za-z0-9\s\-&',.\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeParsedResponse(parsed: any) {
  if (!parsed || typeof parsed !== "object") return;
  if (Array.isArray(parsed.outfit_options)) {
    for (const opt of parsed.outfit_options) {
      if (!opt || typeof opt !== "object") continue;
      opt.option_label = sanitizeText(opt.option_label);
      if (Array.isArray(opt.items)) {
        for (const item of opt.items) {
          if (!item || typeof item !== "object") continue;
          item.name = sanitizeText(item.name);
        }
      }
    }
  }
}

// -----------------------------------------------------------------------
// Product search helpers — ported UNCHANGED from generate-ai-recommendations
// -----------------------------------------------------------------------
const shopStyleApiKey = Deno.env.get("SHOPSTYLE_API_KEY");
const serperApiKey = Deno.env.get("SERPER_API_KEY");
const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");

// Serper's /shopping endpoint no longer returns a direct retailer URL: every
// offer now comes back as a Google Shopping offer link (ibp=oshop / udm=28),
// which resolves straight to that retailer's offer. Those are real product
// offers, not generic search pages, so they must not be treated as the
// "google.com/search" fallback we block elsewhere.
const isGoogleShoppingOfferUrl = (url: string): boolean =>
  /[?&]ibp=oshop/i.test(url) || /[?&]udm=28/i.test(url) || /google\.[a-z.]+\/shopping\/product/i.test(url);

const isValidProductUrl = (url: string | null | undefined): boolean => {
  if (!url || typeof url !== "string" || !url.startsWith("http")) return false;
  if (isGoogleShoppingOfferUrl(url)) return true;
  const blocked = [
    "google.com/shopping",
    "google.co.uk/shopping",
    "google.com/search",
    "googleapis.com",
    "javascript:",
  ];
  return !blocked.some((b) => url.includes(b));
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
    if (!response.ok) {
      console.warn("[ShopStyle] API error:", response.status);
      return [];
    }
    const data = await response.json();
    const products = (data.products || [])
      .map((p: any) => {
        const productUrl = extractRetailerUrl(p);
        return {
          retailer: p.retailer?.name || p.brand?.name || "Retailer",
          product_name: p.name || p.brandedName || "Product",
          price: p.priceLabel || (p.price ? `£${p.price}` : null),
          product_url: productUrl,
          image_url: p.image?.sizes?.Best?.url || p.image?.sizes?.Large?.url || p.image?.sizes?.Medium?.url || null,
          source: "shopstyle",
        };
      })
      .filter((p: any) => p.product_url);
    console.log(`[ShopStyle] Found ${products.length} products for "${query}"`);
    return products;
  } catch (err) {
    console.warn("[ShopStyle] Error:", err);
    return [];
  }
};

const searchGoogleShopping = async (query: string, maxPrice: number): Promise<any[]> => {
  if (!serperApiKey) return [];
  try {
    console.log(`[Serper] Searching Google Shopping: "${query}"`);
    const response = await fetch("https://google.serper.dev/shopping", {
      method: "POST",
      headers: { "X-API-KEY": serperApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, gl: "gb", hl: "en", num: 8 }),
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.warn(`[Serper] API error ${response.status}: ${errBody.slice(0, 200)}`);
      return [];
    }
    const data = await response.json();
    const raw = data.shopping || [];
    const results = raw
      .map((r: any) => {
        const priceStr = r.price || "";
        const cleaned = priceStr.replace(/[^0-9.,]/g, "").replace(",", ".");
        const numericPrice = parseFloat(cleaned);
        const productUrl = extractRetailerUrl(r);
        return {
          retailer: r.source || "Retailer",
          product_name: r.title || "Product",
          price: !isNaN(numericPrice) ? `£${numericPrice.toFixed(2)}` : priceStr || null,
          numericPrice: !isNaN(numericPrice) ? numericPrice : null,
          product_url: productUrl,
          image_url: r.imageUrl || null,
          source: "google_shopping",
        };
      })
      .filter((r: any) => r.product_url && (r.numericPrice === null || r.numericPrice <= maxPrice))
      .slice(0, 5)
      .map(({ numericPrice, ...rest }: any) => rest);
    if (raw.length > 0 && results.length === 0) {
      const sample = raw[0] || {};
      console.warn(
        `[Serper] ${raw.length} raw shopping results but 0 usable for "${query}" — sample keys: ${Object.keys(
          sample,
        ).join(",")} | link=${sample.link ?? "none"} | product_link=${sample.product_link ?? "none"} | price=${
          sample.price ?? "none"
        }`,
      );
    } else if (raw.length === 0) {
      console.warn(`[Serper] Empty shopping array for "${query}" (response keys: ${Object.keys(data).join(",")})`);
    }
    console.log(`[Serper] Found ${results.length} products for "${query}"`);
    return results;
  } catch (err) {
    console.warn("[Serper] Error:", err);
    return [];
  }
};

type RetailerTarget = { name: string; domain: string; searchUrl: (encoded: string) => string };

const BUY_RETAILERS_BY_TIER: Record<string, RetailerTarget[]> = {
  budget: [
    { name: "ASOS", domain: "asos.com", searchUrl: (q) => `https://www.asos.com/search/?q=${q}` },
    { name: "H&M", domain: "hm.com", searchUrl: (q) => `https://www2.hm.com/en_gb/search-results.html?q=${q}` },
    { name: "Zara", domain: "zara.com", searchUrl: (q) => `https://www.zara.com/uk/en/search?searchTerm=${q}` },
  ],
  mid_range: [
    {
      name: "John Lewis",
      domain: "johnlewis.com",
      searchUrl: (q) => `https://www.johnlewis.com/search?search-term=${q}`,
    },
    {
      name: "Marks and Spencer",
      domain: "marksandspencer.com",
      searchUrl: (q) => `https://www.marksandspencer.com/MSFindItemsByKeyword?searchTerm=${q}`,
    },
    { name: "Reiss", domain: "reiss.com", searchUrl: (q) => `https://www.reiss.com/uk/search?w=${q}` },
    {
      name: "Selfridges",
      domain: "selfridges.com",
      searchUrl: (q) => `https://www.selfridges.com/GB/en/cat/?freeText=${q}`,
    },
  ],
  luxury: [
    {
      name: "Net-a-Porter",
      domain: "net-a-porter.com",
      searchUrl: (q) => `https://www.net-a-porter.com/en-gb/shop/search/${q}`,
    },
    {
      name: "Selfridges",
      domain: "selfridges.com",
      searchUrl: (q) => `https://www.selfridges.com/GB/en/cat/?freeText=${q}`,
    },
    { name: "Harrods", domain: "harrods.com", searchUrl: (q) => `https://www.harrods.com/en-gb/search?query=${q}` },
  ],
};

const buildSearchUrls = (query: string, tier: string): any[] => {
  const encoded = encodeURIComponent(query);
  const retailers = BUY_RETAILERS_BY_TIER[tier] || BUY_RETAILERS_BY_TIER.mid_range;
  return retailers.map((r) => ({
    retailer: r.name,
    product_name: `Browse ${r.name} for "${query}"`,
    price: null,
    product_url: r.searchUrl(encoded),
    image_url: null,
    source: "retailer_search",
  }));
};

const buildRentalSearchUrls = (query: string): any[] => {
  const encoded = encodeURIComponent(query);
  const platforms = [
    { name: "HURR", url: `https://www.hurr.com/search?query=${encoded}` },
    { name: "By Rotation", url: `https://byrotation.com/search?q=${encoded}` },
    { name: "My Wardrobe HQ", url: `https://www.mywardrobehq.com/search?q=${encoded}` },
  ];
  return platforms.map((p) => ({
    platform: p.name,
    product_name: `Browse ${p.name} for "${query}"`,
    price: null,
    product_url: p.url,
    image_url: null,
    type: "rental",
    source: "rental_search",
  }));
};

const searchFirecrawlPlatform = async (
  query: string,
  platform: { name: string; domain: string },
  type: "rental" | "secondhand",
): Promise<any> => {
  if (!firecrawlApiKey) return null;
  try {
    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${firecrawlApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `${query} site:${platform.domain}`,
        limit: 1,
        scrapeOptions: { formats: ["markdown"] },
      }),
    });
    if (!response.ok) return null;
    const searchData = await response.json();
    const result = (searchData?.data || [])[0];
    if (!result) return null;
    const markdown = result.markdown || "";
    const imageUrl = result.metadata?.ogImage || result.metadata?.image || null;
    if (type === "rental") {
      const rentalPriceMatch =
        markdown.match(/£[\d,]+(?:\.\d{2})?\s*(?:\/\s*day|per\s*day|per\s*occasion|to\s*rent)/i) ||
        markdown.match(/(?:rent|rental|from)\s*£[\d,]+(?:\.\d{2})?/i) ||
        markdown.match(/£[\d,]+(?:\.\d{2})?/);
      return {
        platform: platform.name,
        product_name: result.title || result.metadata?.title || "Unknown product",
        price: rentalPriceMatch ? rentalPriceMatch[0] : null,
        product_url: result.url || "",
        image_url: imageUrl,
        type: "rental",
        source: "firecrawl",
      };
    } else {
      const priceMatch = markdown.match(/£[\d,]+(?:\.\d{2})?/);
      const conditionMatch = markdown.match(
        /(?:condition|quality)[:\s]*(excellent|very good|good|fair|new with tags|like new|pristine)/i,
      );
      const condition = conditionMatch
        ? conditionMatch[1]
        : markdown.match(/\b(excellent|pristine|like new|new with tags)\b/i)
          ? "excellent"
          : markdown.match(/\b(very good|great condition)\b/i)
            ? "good"
            : null;
      return {
        platform: platform.name,
        product_name: result.title || result.metadata?.title || "Unknown product",
        price: priceMatch ? priceMatch[0] : null,
        product_url: result.url || "",
        image_url: imageUrl,
        condition: condition || "good",
        type: "secondhand",
        source: "firecrawl",
      };
    }
  } catch (err) {
    return null;
  }
};

const PRIORITY_FASHION_RETAILERS = [
  "ASOS",
  "Zara",
  "H&M",
  "Net-a-Porter",
  "Reiss",
  "Mango",
  "Other Stories",
  "Whistles",
  "Phase Eight",
  "Ghost",
  "Monsoon",
  "John Lewis",
  "Marks and Spencer",
  "COS",
  "Selfridges",
  "Matches Fashion",
];

const prioritizeRetailers = (results: any[]): any[] => {
  const fashion = results.filter((r: any) =>
    PRIORITY_FASHION_RETAILERS.some((retailer) => r.retailer?.toLowerCase().includes(retailer.toLowerCase())),
  );
  const other = results.filter(
    (r: any) =>
      !PRIORITY_FASHION_RETAILERS.some((retailer) => r.retailer?.toLowerCase().includes(retailer.toLowerCase())),
  );
  return [...fashion, ...other];
};

const SEARCH_CACHE_VERSION = "oracle-product-search-v5";

const normalizeImageUrl = (url: string | null | undefined): string | null => {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (!trimmed.startsWith("http")) return null;
  return trimmed;
};

const normalizeUrlForDedupe = (url: string): string => {
  try {
    const u = new URL(url);
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"].forEach((p) =>
      u.searchParams.delete(p),
    );
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch (_) {
    return url;
  }
};

const isGoogleSearchFallback = (result: any): boolean => {
  const url = String(result?.product_url || "");
  if (isGoogleShoppingOfferUrl(url)) return false;
  return url.includes("google.com/search") || url.includes("google.co.uk/search");
};

const productScore = (result: any): number => {
  let score = 0;
  if (result?.source === "google_shopping" || result?.source === "shopstyle") score += 6;
  if (result?.source === "firecrawl") score += 4;
  if (result?.image_url) score += 3;
  if (result?.price) score += 2;
  if (result?.source === "retailer_search" || result?.source === "rental_search") score -= 4;
  return score;
};

// Result-side guard: drop results that point to a US/non-UK storefront.
// Only applies when at least one UK-looking result remains, so a search
// that returns only US pages is still surfaced rather than emptied.
function filterOutNonUkStorefronts(results: any[]): any[] {
  const filtered = results.filter((r: any) => {
    const url = String(r?.product_url || "").toLowerCase();
    if (url.includes("/us/")) return false;
    if (url.includes(".com/us")) return false;
    if (/https?:\/\/us\./i.test(url)) return false;

    const title = String(r?.product_name || "");
    const retailer = String(r?.retailer || "");
    const combined = `${title} ${retailer}`.toLowerCase();
    if (/\|\s*[^|]*us\b/i.test(combined)) return false;
    if (retailer.toLowerCase().endsWith(" us")) return false;
    if (/\b(m&s|marks?\s*&?\s*spencer)\s+us\b/i.test(combined)) return false;

    return true;
  });
  return filtered.length > 0 ? filtered : results;
}

const cleanProductResults = (results: any[], limit: number): any[] => {
  const seen = new Set<string>();
  return filterOutNonUkStorefronts(results)
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
    .replace(
      /\b(floor[-\s]?length|full[-\s]?length|architectural|statement|modern|sleek|luminous|perfect|versatile)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  const lower = cleaned.toLowerCase();
  const colours = [
    "black",
    "navy",
    "midnight navy",
    "emerald",
    "green",
    "champagne",
    "ivory",
    "white",
    "red",
    "burgundy",
    "pink",
    "silver",
    "gold",
    "cream",
  ];
  const fabrics = ["silk", "satin", "velvet", "crepe", "lace", "chiffon"];
  const garments = [
    "gown",
    "dress",
    "jumpsuit",
    "suit",
    "blazer",
    "trousers",
    "skirt",
    "coat",
    "heels",
    "sandals",
    "clutch",
    "bag",
  ];
  const colour = colours.find((c) => lower.includes(c));
  const fabric = fabrics.find((f) => lower.includes(f));
  const garment = garments.find((g) => lower.includes(g));

  const variants = [
    query.trim(),
    cleaned,
    [colour, fabric, garment].filter(Boolean).join(" "),
    [colour, garment].filter(Boolean).join(" "),
    [fabric, garment].filter(Boolean).join(" "),
    garment === "gown" || garment === "dress" ? `evening ${garment}` : garment || "",
  ];

  // Colour anchoring: when the item names a colour, EVERY variant must keep
  // that colour word, otherwise broad variants ("silk slip dress") pull back
  // whatever colour the retailer happens to rank first.
  const anchor = detectColourInText(query) || colour || null;
  const anchored = anchor
    ? variants.map((v) => {
        const t = v.trim();
        if (!t) return t;
        return detectColourInText(t) ? t : `${anchor} ${t}`;
      })
    : variants;

  return Array.from(new Set(anchored.map((v) => v.trim()).filter(Boolean))).slice(0, 5);
};


const searchFirecrawlRetailer = async (query: string, retailer: RetailerTarget): Promise<any | null> => {
  if (!firecrawlApiKey) return null;
  try {
    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${firecrawlApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `${query} site:${retailer.domain}`,
        limit: 1,
        scrapeOptions: { formats: ["markdown"] },
      }),
    });
    if (!response.ok) return null;
    const searchData = await response.json();
    const result = (searchData?.data || [])[0];
    if (!result || !isValidProductUrl(result.url)) return null;
    const markdown = result.markdown || "";
    const priceMatch = markdown.match(/£[\d,]+(?:\.\d{2})?/);
    return {
      retailer: retailer.name,
      product_name: result.title || result.metadata?.title || `Result from ${retailer.name}`,
      price: priceMatch ? priceMatch[0] : null,
      product_url: result.url,
      image_url: result.metadata?.ogImage || result.metadata?.image || null,
      source: "firecrawl",
    };
  } catch (_) {
    return null;
  }
};

const searchSerperRetailer = async (query: string, retailer: RetailerTarget): Promise<any | null> => {
  if (!serperApiKey) return null;
  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": serperApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `${query} site:${retailer.domain}`, gl: "gb", hl: "en", num: 3 }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const result = (data.organic || []).find((r: any) => isValidProductUrl(r.link));
    if (!result) return null;
    const priceMatch = `${result.title || ""} ${result.snippet || ""}`.match(/£[\d,]+(?:\.\d{2})?/);
    return {
      retailer: retailer.name,
      product_name: result.title || `Result from ${retailer.name}`,
      price: priceMatch ? priceMatch[0] : null,
      product_url: result.link,
      image_url: result.imageUrl || result.thumbnail || null,
      source: "serper_web",
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
  { name: "HURR", domain: "hurr.com" },
  { name: "By Rotation", domain: "byrotation.com" },
  { name: "My Wardrobe HQ", domain: "mywardrobehq.com" },
];

const priceTierMax = (tier: string): number => (tier === "budget" ? 100 : tier === "luxury" ? 2000 : 300);
// Phase 1: tracked affiliate links via the /go edge function.
// Applied at response time only — never stored in search_cache.
function trackedLink(productUrl: string, userId: string | null, briefId: string | null): string {
  const params = new URLSearchParams({ pid: productUrl });
  if (userId) params.set("u", userId);
  if (briefId) params.set("b", briefId);
  return `${supabaseUrl}/functions/v1/go?${params.toString()}`;
}

function wrapProductLinks(items: any[], userId: string | null, briefId: string | null): any[] {
  const wrapArr = (arr: any[]) =>
    (arr ?? []).map((p: any) =>
      p?.product_url ? { ...p, product_url: trackedLink(p.product_url, userId, briefId) } : p,
    );
  return (items ?? []).map((it: any) => ({
    ...it,
    ...(Array.isArray(it?.buy) ? { buy: wrapArr(it.buy) } : {}),
    ...(Array.isArray(it?.rent) ? { rent: wrapArr(it.rent) } : {}),
  }));
}
async function cachedSearch(
  supabase: any,
  query: string,
  tier: string,
  kind: "buy" | "rent",
  run: () => Promise<any[]>,
): Promise<any[]> {
  const key = `${SEARCH_CACHE_VERSION}|${query.trim().toLowerCase()}|${tier}|${kind}`;
  try {
    const { data } = await supabase
      .from("search_cache")
      .select("results, created_at")
      .eq("query_key", key)
      .maybeSingle();
    if (data?.created_at && Array.isArray(data.results)) {
      const ageMs = Date.now() - new Date(data.created_at).getTime();
      if (ageMs < 24 * 3600 * 1000) return cleanProductResults(data.results as any[], kind === "buy" ? 4 : 2);
    }
  } catch (_) {
    /* cache miss on error */
  }
  const results = await run();
  try {
    await supabase
      .from("search_cache")
      .upsert({ query_key: key, results, created_at: new Date().toISOString() }, { onConflict: "query_key" });
  } catch (_) {
    /* non-fatal */
  }
  return results;
}

// Prefer Serper/Google Shopping thumbnails (encrypted-tbn.googleusercontent
// hosts) over retailer-CDN images, which frequently hotlink-block. When we
// have a google_shopping result whose retailer matches a
// serper_web/firecrawl/retailer_search result, copy the Google thumbnail
// onto the retailer result if it lacks one or its image is from the
// retailer's own CDN.
function preferGoogleThumbnails(results: any[]): any[] {
  const googleByRetailer = new Map<string, string>();
  for (const r of results) {
    if (r?.source === "google_shopping" && r.image_url && r.retailer) {
      const key = String(r.retailer).toLowerCase();
      if (!googleByRetailer.has(key)) googleByRetailer.set(key, r.image_url);
    }
  }
  return results.map((r: any) => {
    if (r?.source === "google_shopping" || !r?.retailer) return r;
    const key = String(r.retailer).toLowerCase();
    const googleImg = googleByRetailer.get(key);
    if (!googleImg) return r;
    const currentIsRetailerCdn =
      !r.image_url || (typeof r.image_url === "string" && !/googleusercontent|gstatic/.test(r.image_url));
    return currentIsRetailerCdn ? { ...r, image_url: googleImg } : r;
  });
}

// `deep` is the second-chance pass, run only after the shallow pass has
// already queried Google Shopping / ShopStyle for every query variant. It
// therefore SKIPS those variant lookups entirely (re-running them produced
// an identical duplicate call per item) and only widens the retailer-level
// site: searches, seeded with whatever the shallow pass already found.
async function runBuySearch(query: string, tier: string, deep = false, seed: any[] = []): Promise<any[]> {
  const maxPrice = priceTierMax(tier);
  const variants = buildProductQueryVariants(query);
  let gathered: any[] = deep ? cleanProductResults(prioritizeRetailers(seed), 32) : [];

  const candidateTarget = deep ? 20 : 8;
  const poolCap = deep ? 32 : 16;
  const finalCap = deep ? 24 : 12;

  if (!deep) {
    for (const variant of variants) {
      const [g, s] = await Promise.all([searchGoogleShopping(variant, maxPrice), searchShopStyle(variant, maxPrice)]);
      // Gather a wider candidate pool so the menswear/colour filters can
      // drop a handful of items and still leave at least 3 usable buy options.
      gathered = cleanProductResults(prioritizeRetailers([...gathered, ...g, ...s]), poolCap);
      if (gathered.length >= candidateTarget) break;
    }
  }

  let realResults = cleanProductResults(prioritizeRetailers(gathered), finalCap);
  if (deep || realResults.length < 6) {
    const retailerPool = (BUY_RETAILERS_BY_TIER[tier] || BUY_RETAILERS_BY_TIER.mid_range).slice(0, deep ? 6 : 4);
    const [webResults, firecrawlResults] = await Promise.all([
      Promise.all(retailerPool.map((r) => searchSerperRetailer(variants[1] || query, r))),
      Promise.all(retailerPool.map((r) => searchFirecrawlRetailer(variants[1] || query, r))),
    ]);
    const merged = [...gathered, ...realResults, ...webResults.filter(Boolean), ...firecrawlResults.filter(Boolean)];
    realResults = cleanProductResults(prioritizeRetailers(preferGoogleThumbnails(merged)), finalCap);
  } else {
    realResults = preferGoogleThumbnails(realResults);
  }

  // Only return real, specific products — no "Browse X for..." fallback cards.
  return realResults;
}

// Rental lookups now use Serper web search restricted by site: (Firecrawl was
// too slow for an interactive tap). We parse title/link/price where present.
async function searchSerperRental(query: string, platform: { name: string; domain: string }): Promise<any | null> {
  if (!serperApiKey) return null;
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": serperApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `${query} site:${platform.domain}`, gl: "gb", hl: "en", num: 3 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = (data.organic || []).find(
      (r: any) =>
        isValidProductUrl(r.link) &&
        // avoid landing on generic search / category index pages
        !/\/(search|category|categories|browse)(\/|\?|$)/i.test(r.link),
    );
    if (!result) return null;
    const text = `${result.title || ""} ${result.snippet || ""}`;
    const priceMatch = text.match(/£[\d,]+(?:\.\d{2})?(?:\s*(?:\/\s*day|per\s*day|per\s*occasion))?/i);
    return {
      platform: platform.name,
      product_name: result.title || `Result from ${platform.name}`,
      price: priceMatch ? priceMatch[0] : null,
      product_url: result.link,
      image_url: result.imageUrl || result.thumbnail || null,
      type: "rental",
      source: "serper_web",
    };
  } catch (_) {
    return null;
  }
}

async function runRentSearch(query: string): Promise<any[]> {
  const settled = await Promise.all(RENTAL_PLATFORMS.map((p) => searchSerperRental(query, p)));
  return cleanProductResults(settled.filter(Boolean), 2);
}

// Whole-word garment filter: for a "tailored suit", the product title must
// contain "suit" as its own word — "bodysuit" is excluded, "trouser suit"
// passes.
function filterByGarmentType(results: any[], garmentType: string | undefined): any[] {
  const g = (garmentType || "").trim().toLowerCase();
  if (!g) return results;
  const escaped = g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}s?\\b`, "i");
  return results.filter((r) => re.test(String(r?.product_name || "")));
}

// -----------------------------------------------------------------------
// Colour matching — palette or overridden, the query follows the item's
// stated colour. Neighbouring shades (sage/olive/khaki, terracotta/rust,
// navy/dark blue) count as compatible; titles naming no colour always pass.
// -----------------------------------------------------------------------
const COLOUR_WORDS = [
  "black",
  "white",
  "ivory",
  "cream",
  "off-white",
  "beige",
  "tan",
  "camel",
  "nude",
  "stone",
  "sand",
  "grey",
  "gray",
  "charcoal",
  "silver",
  "gold",
  "champagne",
  "bronze",
  "copper",
  "navy",
  "dark blue",
  "midnight",
  "blue",
  "sky",
  "cobalt",
  "denim",
  "indigo",
  "green",
  "sage",
  "olive",
  "khaki",
  "emerald",
  "forest",
  "mint",
  "teal",
  "red",
  "burgundy",
  "wine",
  "maroon",
  "crimson",
  "scarlet",
  "pink",
  "blush",
  "rose",
  "fuchsia",
  "magenta",
  "coral",
  "orange",
  "terracotta",
  "rust",
  "yellow",
  "mustard",
  "ochre",
  "purple",
  "lilac",
  "lavender",
  "plum",
  "violet",
  "brown",
  "chocolate",
  "mocha",
];

const COLOUR_NEIGHBOUR_GROUPS: string[][] = [
  ["sage", "olive", "khaki"],
  ["terracotta", "rust"],
  ["navy", "dark blue", "midnight", "indigo"],
  ["beige", "tan", "camel", "nude", "stone", "sand", "cream", "ivory", "off-white"],
  ["burgundy", "wine", "maroon"],
  ["pink", "blush", "rose"],
  ["grey", "gray", "charcoal"],
  ["red", "crimson", "scarlet"],
  ["blue", "sky", "cobalt", "denim"],
  ["green", "emerald", "forest", "mint", "teal"],
  ["yellow", "mustard", "ochre"],
  ["purple", "lilac", "lavender", "plum", "violet"],
  ["brown", "chocolate", "mocha"],
  ["orange", "coral"],
  ["white", "ivory", "cream", "off-white"],
  ["gold", "champagne", "bronze", "copper"],
];

function detectColourInText(text: string): string | null {
  const lower = ` ${String(text || "").toLowerCase()} `;
  // longest-first so "dark blue" beats "blue"
  const sorted = [...COLOUR_WORDS].sort((a, b) => b.length - a.length);
  for (const c of sorted) {
    const re = new RegExp(`(^|[^a-z])${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i");
    if (re.test(lower)) return c;
  }
  return null;
}

function coloursCompatible(requested: string, found: string): boolean {
  const a = requested.toLowerCase();
  const b = found.toLowerCase();
  if (a === b) return true;
  for (const group of COLOUR_NEIGHBOUR_GROUPS) {
    if (group.includes(a) && group.includes(b)) return true;
  }
  return false;
}

// Drop results whose title contains a clearly contradicting colour word,
// UNLESS the title also contains the requested colour. Titles with no
// colour word are only PROVISIONALLY kept — see verifyColourByImage.
function filterByColour(results: any[], requestedColour: string | null): any[] {
  if (!requestedColour) return results;
  const req = requestedColour.toLowerCase();
  return results.filter((r) => {
    const title = String(r?.product_name || "");
    if (!title) return true;
    const lower = ` ${title.toLowerCase()} `;
    // If the title contains the requested colour (or a neighbour), keep.
    const found = detectColourInText(title);
    if (!found) return true; // no colour named → pass
    if (coloursCompatible(req, found)) return true;
    // Title names some colour, but incompatible. Still keep if the
    // requested colour appears anywhere in the title too.
    const reqRe = new RegExp(`(^|[^a-z])${req.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i");
    return reqRe.test(lower);
  });
}

// -----------------------------------------------------------------------
// Image-based colour verification. Titles frequently omit the colour
// ("Silk Slip Dress") so a cream listing sails through the title filter on
// a "deep teal" request. For those colour-silent titles we look at the
// product photo: decode a small copy, take the central region, ignore
// near-white/near-black background pixels, and work out the dominant
// colour family. Only a CONFIDENT conflict drops the result — any decode
// failure, timeout, missing image or ambiguous photo keeps it.
// -----------------------------------------------------------------------
type ColourFamily =
  | "red"
  | "pink"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "brown"
  | "neutral-light"
  | "neutral-dark"
  | "grey"
  | "metallic";

const COLOUR_TO_FAMILY: Record<string, ColourFamily> = {
  black: "neutral-dark",
  charcoal: "neutral-dark",
  white: "neutral-light",
  ivory: "neutral-light",
  cream: "neutral-light",
  "off-white": "neutral-light",
  beige: "neutral-light",
  stone: "neutral-light",
  sand: "neutral-light",
  nude: "neutral-light",
  tan: "brown",
  camel: "brown",
  brown: "brown",
  chocolate: "brown",
  mocha: "brown",
  grey: "grey",
  gray: "grey",
  silver: "metallic",
  gold: "metallic",
  champagne: "metallic",
  bronze: "metallic",
  copper: "metallic",
  navy: "blue",
  "dark blue": "blue",
  midnight: "blue",
  blue: "blue",
  sky: "blue",
  cobalt: "blue",
  denim: "blue",
  indigo: "blue",
  green: "green",
  sage: "green",
  olive: "green",
  khaki: "green",
  emerald: "green",
  forest: "green",
  mint: "green",
  teal: "green",
  red: "red",
  burgundy: "red",
  wine: "red",
  maroon: "red",
  crimson: "red",
  scarlet: "red",
  pink: "pink",
  blush: "pink",
  rose: "pink",
  fuchsia: "pink",
  magenta: "pink",
  coral: "orange",
  orange: "orange",
  terracotta: "orange",
  rust: "orange",
  yellow: "yellow",
  mustard: "yellow",
  ochre: "yellow",
  purple: "purple",
  lilac: "purple",
  lavender: "purple",
  plum: "purple",
  violet: "purple",
};

// Families that are close enough that a photo shouldn't veto the listing.
const FAMILY_NEIGHBOURS: Record<string, ColourFamily[]> = {
  red: ["pink", "orange", "brown", "purple"],
  pink: ["red", "purple", "neutral-light"],
  orange: ["red", "brown", "yellow"],
  yellow: ["orange", "brown", "green", "metallic", "neutral-light"],
  green: ["blue", "yellow", "grey"],
  blue: ["green", "purple", "grey", "neutral-dark"],
  purple: ["blue", "pink", "red"],
  brown: ["orange", "red", "neutral-light", "grey", "metallic"],
  "neutral-light": ["grey", "metallic", "brown", "yellow"],
  "neutral-dark": ["grey", "blue", "brown"],
  grey: ["neutral-light", "neutral-dark", "blue", "green", "metallic"],
  metallic: ["neutral-light", "grey", "yellow", "brown"],
};

function familiesConflict(requested: ColourFamily, observed: ColourFamily): boolean {
  if (requested === observed) return false;
  return !(FAMILY_NEIGHBOURS[requested] || []).includes(observed);
}

function rgbToFamily(r: number, g: number, b: number): ColourFamily | null {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2 / 255;
  const d = max - min;
  const s = d === 0 ? 0 : d / (255 - Math.abs(max + min - 255));
  if (s < 0.15) {
    if (l > 0.82) return "neutral-light";
    if (l < 0.18) return "neutral-dark";
    return "grey";
  }
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  // Dark, desaturated warm tones read as brown rather than orange/red.
  if (h < 45 && l < 0.42 && s < 0.7) return "brown";
  if (h < 15 || h >= 345) return "red";
  if (h < 45) return l < 0.5 ? "brown" : "orange";
  if (h < 70) return "yellow";
  if (h < 170) return "green";
  if (h < 255) return "blue";
  if (h < 290) return "purple";
  if (h < 345) return "pink";
  return null;
}

// Decode the product photo and return its dominant garment colour family,
// or null when the photo is unusable/ambiguous.
async function dominantFamilyFromImage(url: string): Promise<ColourFamily | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 4_000_000) return null;
    const img = await Image.decode(buf);
    const small = img.resize(64, Image.RESIZE_AUTO);
    const w = small.width;
    const h = small.height;
    // Central region only — edges are usually studio background.
    const x0 = Math.floor(w * 0.25);
    const x1 = Math.ceil(w * 0.75);
    const y0 = Math.floor(h * 0.2);
    const y1 = Math.ceil(h * 0.85);
    const counts = new Map<ColourFamily, number>();
    let chromatic = 0;
    let total = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const px = small.getRGBAAt(x, y);
        const [r, g, b, a] = [px[0], px[1], px[2], px[3]];
        if (a < 200) continue;
        const fam = rgbToFamily(r, g, b);
        if (!fam) continue;
        total++;
        if (fam !== "neutral-light" && fam !== "neutral-dark" && fam !== "grey") chromatic++;
        counts.set(fam, (counts.get(fam) || 0) + 1);
      }
    }
    if (total < 50) return null;
    // Prefer the dominant chromatic family when the garment has real colour;
    // otherwise fall back to the overall dominant family.
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const chromaticEntries = entries.filter(
      ([f]) => f !== "neutral-light" && f !== "neutral-dark" && f !== "grey",
    );
    if (chromatic / total >= 0.3 && chromaticEntries.length) {
      const [fam, n] = chromaticEntries[0];
      return n / chromatic >= 0.5 ? fam : null;
    }
    const [fam, n] = entries[0];
    return n / total >= 0.6 ? fam : null;
  } catch (_) {
    return null;
  }
}

// Verify colour-silent listings against their photo. Runs on at most
// `maxChecks` results, in parallel; anything unverifiable is kept.
async function verifyColourByImage(
  results: any[],
  requestedColour: string | null,
  maxChecks = 8,
): Promise<any[]> {
  if (!requestedColour || results.length === 0) return results;
  const wantedFamily = COLOUR_TO_FAMILY[requestedColour.toLowerCase()];
  if (!wantedFamily) return results;

  const needsCheck: number[] = [];
  results.forEach((r, i) => {
    const title = String(r?.product_name || "");
    if (detectColourInText(title)) return; // title already spoke for itself
    if (typeof r?.image_url === "string" && /^https?:\/\//i.test(r.image_url)) needsCheck.push(i);
  });
  if (needsCheck.length === 0) return results;

  const checked = needsCheck.slice(0, maxChecks);
  const observed = await Promise.all(checked.map((i) => dominantFamilyFromImage(results[i].image_url)));
  const drop = new Set<number>();
  checked.forEach((idx, k) => {
    const fam = observed[k];
    if (fam && familiesConflict(wantedFamily, fam)) drop.add(idx);
  });
  if (drop.size === 0) return results;
  const kept = results.filter((_, i) => !drop.has(i));
  console.log(
    `[colour-verify] requested=${requestedColour} dropped ${drop.size}/${checked.length} colour-silent results by photo`,
  );
  // Never let verification wipe the shelf entirely.
  return kept.length > 0 ? kept : results;
}


// Buy cards must be real, specific products with a price. Allow at most one
// price-missing card, and only when fewer than 3 priced results exist.
function enforceHonestBuyRules(results: any[], limit = 4): any[] {
  const priced = results.filter((r) => r?.price);
  const unpriced = results.filter((r) => !r?.price);
  const out = priced.slice(0, limit);
  if (out.length < 3 && unpriced.length > 0 && out.length < limit) {
    out.push(unpriced[0]);
  }
  return out;
}

// Womenswear-by-default guarantees. The system prompt tells the model to
// include "women's" in every query, but we enforce it in code too so a
// stray menswear query can never leak through to Serper/ShopStyle.
const WOMEN_TERMS_RE = /\b(women'?s?|woman'?s?|ladies|female|womens)\b/i;
const MEN_TERMS_RE = /\b(men'?s?|man'?s?|male|mens)\b/i;

function enforceGenderInQuery(query: string, isMenswear: boolean): string {
  const q = (query || "").trim();
  if (!q) return q;
  if (isMenswear) {
    return MEN_TERMS_RE.test(q) || WOMEN_TERMS_RE.test(q) ? q : `men's ${q}`;
  }
  // Womenswear (default): strip any men's terms, then ensure women's is present.
  let out = q.replace(MEN_TERMS_RE, "").replace(/\s+/g, " ").trim();
  if (!WOMEN_TERMS_RE.test(out)) out = `women's ${out}`;
  return out;
}

// Result-side guard: drop obvious menswear listings from womenswear searches.
// Checks the title, the product URL (for /men/, /mens/, /men-, /mens-,
// "menswear" path segments), and any displayed source / retailer /
// breadcrumb / category text. "Men" / "Men's" / "Mens" match as whole
// words only, never matching "women" or "womens".
function filterOutMenswear(results: any[], isMenswear: boolean): any[] {
  if (isMenswear) return results;
  const menWordRe = /(^|[^a-z])(men'?s?|mens)([^a-z]|$)/i;
  // URL path segments that unambiguously indicate a men's department.
  const menUrlRe = /(\/men\/|\/mens\/|\/men-|\/mens-|menswear)/i;
  const stripWomen = (s: string) => s.replace(/wom[ae]n'?s?/gi, "");
  return results.filter((r) => {
    const title = stripWomen(String(r?.product_name || ""));
    if (menWordRe.test(title)) return false;

    const url = String(r?.product_url || "");
    // Strip "women" substrings from the URL so "/womens-" etc don't match.
    const strippedUrl = url.replace(/wom[ae]ns?/gi, "");
    if (menUrlRe.test(strippedUrl)) return false;

    // Displayed source / retailer / breadcrumb / category text.
    const extras = [r?.retailer, r?.source_label, r?.breadcrumb, r?.breadcrumbs, r?.category, r?.department]
      .flat()
      .filter((x) => typeof x === "string")
      .map((x: string) => stripWomen(x))
      .join(" ");
    if (extras && (menWordRe.test(extras) || /menswear/i.test(extras))) return false;

    return true;
  });
}

async function searchItemsForOption(
  supabase: any,
  items: any[],
  rentalPreference: string | undefined,
  stylingCategory: string | undefined,
): Promise<any[]> {
  const isMenswear = stylingCategory === "menswear";
  // Run every item's buy + rent lookups fully in parallel.
  return await Promise.all(
    items.map((item: any) => getProductsForItem(supabase, item, rentalPreference, isMenswear)),
  );
}

// Wrapper around the buy/rent search for a single item. When
// SELECTIKA_ENABLED is false this behaves EXACTLY like the previous
// inline logic. When true it first tries the partner_products table and
// falls back to the existing web search when fewer than 3 matches are found.
async function getProductsForItem(
  supabase: any,
  item: any,
  rentalPreference: string | undefined,
  isMenswear: boolean,
): Promise<any> {
  if (SELECTIKA_ENABLED) {
    // TODO(selectika): query partner_products for in-stock matches on
    // category and tags once the Selectika feed is wired up. For now this
    // returns an empty list so we always fall through to the existing
    // search below.
    const partnerBuy: any[] = await queryPartnerProductsForItem(supabase, item, isMenswear);
    if (partnerBuy.length >= 3) {
      return { ...item, buy: partnerBuy.slice(0, 4), rent: [] };
    }
  }

  return await runExistingWebSearchForItem(supabase, item, rentalPreference, isMenswear);
}

// TODO(selectika): implement partner_products lookup here.
async function queryPartnerProductsForItem(
  _supabase: any,
  _item: any,
  _isMenswear: boolean,
): Promise<any[]> {
  return [];
}

// The original, unchanged buy/rent search logic for a single item.
async function runExistingWebSearchForItem(
  supabase: any,
  item: any,
  rentalPreference: string | undefined,
  isMenswear: boolean,
): Promise<any> {
  const keywordsList = Array.isArray(item?.search_keywords)
    ? item.search_keywords.filter((k: any) => typeof k === "string" && k.trim())
    : [];
  const keywords =
    keywordsList.length > 0 ? keywordsList.join(" ") : typeof item?.name === "string" ? item.name : "";
  const garmentType = typeof item?.garment_type === "string" ? item.garment_type : "";
  // Detect a colour anywhere in the item's stated identity (keywords or name).
  const colourSource = `${keywords} ${typeof item?.name === "string" ? item.name : ""}`;
  const requestedColour = detectColourInText(colourSource);
  // Lead the retailer query with colour + garment when a colour is
  // named, e.g. "sage green midi dress" → "sage midi dress" first.
  let rawQuery: string;
  if (requestedColour && garmentType) {
    const rest = keywords
      .toLowerCase()
      .replace(new RegExp(`\\b${requestedColour.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "")
      .replace(new RegExp(`\\b${garmentType.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i"), "")
      .replace(/\s+/g, " ")
      .trim();
    rawQuery = [requestedColour, garmentType, rest].filter(Boolean).join(" ").trim();
  } else {
    const includeGarment = garmentType && !keywords.toLowerCase().includes(garmentType.toLowerCase());
    rawQuery = [keywords, includeGarment ? garmentType : ""].filter(Boolean).join(" ").trim();
  }
  const baseQuery = enforceGenderInQuery(rawQuery, isMenswear);
  const tier = item?.price_tier || "mid_range";
  const wantBuy = rentalPreference !== "rent_only";
  const wantRent = rentalPreference !== "buy_only" && item?.rental_market_likely === true;
  const [buyRaw, rentRaw] = await Promise.all([
    wantBuy && baseQuery
      ? cachedSearch(supabase, baseQuery, tier, "buy", () => runBuySearch(baseQuery, tier))
      : Promise.resolve([]),
    wantRent && baseQuery
      ? cachedSearch(supabase, baseQuery, tier, "rent", () => runRentSearch(baseQuery))
      : Promise.resolve([]),
  ]);

  const applyBuyFilters = async (raw: any[]) => {
    const m = filterOutMenswear(raw, isMenswear);
    const g = filterByGarmentType(m, garmentType);
    const c = filterByColour(g, requestedColour);
    // Photo-level check for listings whose title never names a colour.
    return await verifyColourByImage(c, requestedColour);
  };

  let buyFiltered = await applyBuyFilters(buyRaw);
  // If garment/colour filter thinned results below 3, fetch a deeper
  // candidate pool via the existing search-depth mechanism and retry.
  if (wantBuy && baseQuery && buyFiltered.length < 3) {
    const deepRaw = await cachedSearch(supabase, `${baseQuery} __deep`, tier, "buy", () =>
      runBuySearch(baseQuery, tier, true, buyRaw),
    );
    buyFiltered = await applyBuyFilters(deepRaw);
  }
  const buy = enforceHonestBuyRules(buyFiltered, 4);

  const rentFiltered = await verifyColourByImage(
    filterByColour(
      filterByGarmentType(filterOutMenswear(rentRaw, isMenswear), garmentType),
      requestedColour,
    ),
    requestedColour,
    4,
  );
  const rent = rentFiltered.slice(0, 2);

  return { ...item, buy, rent };
}


// -----------------------------------------------------------------------
// Handler
// -----------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeadersFor(req) });
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
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
        if (authUser) user = { id: authUser.id, email: authUser.email ?? undefined };
      } catch (_) {
        // fall through as guest
      }
    }

    // Parse request body (needed to decide whether to rate-limit)
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    // community_summary — auth-required, lightweight, single gateway call.
    // Does NOT count against guest rate limits (guests are rejected outright).
    if (action === "community_summary") {
      if (!user) {
        return jsonResponse(req, { error: "auth_required" }, 401);
      }
      const { occasion = "", vote_summary = "", comments_text = "", option_count = 0 } = body ?? {};

      const system =
        "You are Serena, a personal stylist. Write a short, warm, fun 2-3 sentence summary of this community outfit poll: which option the community favoured and why, drawing on the vote counts and comments. UK English. No preamble.";
      const userMsg = [
        `Occasion: ${occasion || "(not specified)"}`,
        `Options: ${option_count}`,
        `Votes: ${vote_summary || "(none yet)"}`,
        `Comments:\n${comments_text || "(no comments)"}`,
      ].join("\n\n");

      try {
        const resp = await fetch(AI_GATEWAY_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: "system", content: system },
              { role: "user", content: userMsg },
            ],
            max_tokens: 300,
            temperature: 0.8,
          }),
        });
        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          console.error("community_summary gateway error:", resp.status, errText);
          return jsonResponse(req, { error: "gateway_error" }, 502);
        }
        const json = await resp.json();
        const summary = json?.choices?.[0]?.message?.content?.trim() || "";
        if (!summary) {
          return jsonResponse(req, { error: "empty_summary" }, 502);
        }
        return jsonResponse(req, { summary });
      } catch (err) {
        console.error("community_summary failed:", err);
        return jsonResponse(req, { error: "summary_failed" }, 500);
      }
    }

    // Guest IP rate limiting — mirrors generate-ai-recommendations
    if (!user) {
      const forwarded = req.headers.get("x-forwarded-for") || "";
      const guestIp = forwarded.split(",")[0]?.trim() || "unknown";
      const { data: guestLimit, error: guestLimitError } = await supabase.rpc("check_guest_rate_limit", {
        ip_param: guestIp,
        daily_limit: 5,
      });
      if (guestLimitError) {
        console.error("Guest rate limit check error:", guestLimitError);
      }
      if (guestLimit && guestLimit.allowed === false) {
        return jsonResponse(
          req,
          {
            error: "Rate limit exceeded",
            message: "You've reached the daily limit for guests. Sign up to continue getting styling advice.",
          },
          429,
        );
      }
    }

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
      const nonWardrobe = items_to_search.filter((i: any) => i?.source !== "from_wardrobe");
      const searched = await searchItemsForOption(
        supabase,
        nonWardrobe,
        typeof rental_preference === "string" ? rental_preference : undefined,
        typeof styling_category === "string" ? styling_category : undefined,
      );
      return jsonResponse(req, {
        ok: true,
        option_label,
        items: wrapProductLinks(searched, user?.id ?? null, null),
      });
    }

    const {
      user_message: userMessageSnake,
      message: userMessageCamel,
      conversation_history: conversationHistorySnake,
      conversationHistory: conversationHistoryCamel,
      accumulated_context = null,
      anchor_item_id = null,
      assumed_current_location: assumedLocation = null,
    } = body ?? {};

    const user_message = typeof userMessageSnake === "string" ? userMessageSnake : userMessageCamel;
    const conversation_history = Array.isArray(conversationHistorySnake)
      ? conversationHistorySnake
      : conversationHistoryCamel;

    if (typeof user_message !== "string" || !user_message.trim()) {
      return jsonResponse(req, { error: "user_message is required" }, 400);
    }

    // Fetch assumed_current_location_weather ONCE up front when coords provided
    let assumed_current_location_weather: any = null;
    if (
      assumedLocation &&
      typeof assumedLocation === "object" &&
      typeof assumedLocation.lat === "number" &&
      typeof assumedLocation.lon === "number"
    ) {
      try {
        const { data, error } = await supabase.functions.invoke("weather-recommendations", {
          body: { lat: assumedLocation.lat, lon: assumedLocation.lon },
        });
        if (!error && data) assumed_current_location_weather = data;
      } catch (err) {
        console.warn("assumed_current_location_weather fetch failed:", err);
      }
    }

    // Parallel context fetches for authenticated users
    let styleProfile: any = null;
    let wardrobeItems: any[] = [];
    let preferenceInsights: any[] = [];
    let recentFeedback: any[] = [];
    let recentSelections: any[] = [];

    if (user) {
      const [profileRes, wardrobeRes, insightsRes, feedbackRes, selectionsRes] = await Promise.all([
        supabase.from("user_style_profiles").select("*").eq("user_id", user.id).maybeSingle(),
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
    } // Two-tap product feedback (Phase 1 partnership table)
    let productSaved: string[] = [];
    let productRejected: string[] = [];
    if (user) {
      const { data: pf } = await supabase
        .from("product_feedback")
        .select("product_ref, verdict")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      productSaved = (pf ?? []).filter((f) => f.verdict === "save").map((f) => f.product_ref);
      productRejected = (pf ?? []).filter((f) => f.verdict === "not_for_me").map((f) => f.product_ref);
    }

    // Resolve the anchor item (Style this). Only honoured for authenticated
    // users whose wardrobe actually contains the requested id — guests or
    // stale ids fall back to a normal (non-anchored) run.
    let anchorItem: {
      id: string;
      name: string;
      category: string | null;
      colour: string | null;
      brand: string | null;
    } | null = null;
    if (user && typeof anchor_item_id === "string" && anchor_item_id) {
      const match = wardrobeItems.find((w) => String(w.id) === String(anchor_item_id));
      if (match) {
        anchorItem = {
          id: String(match.id),
          name: match.name,
          category: match.category ?? null,
          colour: match.colour ?? match.color ?? null,
          brand: match.brand ?? null,
        };
      } else {
        console.warn(`Anchor item ${anchor_item_id} not found for user ${user.id}; ignoring anchor`);
      }
    }
    const effectiveAnchorId = anchorItem?.id ?? null;

    // Assemble the context block for the model
    const contextPayload: any = {
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
      product_feedback_saved: productSaved.slice(0, 15),
      product_feedback_rejected: productRejected.slice(0, 15),
      accumulated_context,
      anchor_item_id: effectiveAnchorId,
      anchor_item: anchorItem,
      assumed_current_location_weather,
    };

    const historyMessages = Array.isArray(conversation_history)
      ? conversation_history
          .filter(
            (m: any) =>
              m &&
              typeof m.role === "string" &&
              typeof m.content === "string" &&
              (m.role === "user" || m.role === "assistant"),
          )
          .slice(-20)
          .map((m: any) => ({ role: m.role, content: m.content }))
      : [];

    const buildMessages = () => [
      { role: "system", content: ORACLE_SYSTEM_PROMPT },
      {
        role: "system",
        content: "CONTEXT (JSON — treat as real signals, not decoration):\n" + JSON.stringify(contextPayload),
      },
      ...historyMessages,
      { role: "user", content: user_message },
    ];

    let messages = buildMessages();

    // Call gateway with one retry on tool-call parse failure. No fallback.
    let parsed: any | null = null;
    let lastError: unknown = null;

    const firstPassStart = Date.now();
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
            message:
              gatewayResp.status === 402
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
        sanitizeParsedResponse(parsed);
        break;
      } catch (err) {
        lastError = err;
        console.error(`Tool-call parse failure (attempt ${attempt + 1}):`, err);
      }
    }
    console.log(`[timing] first pass elapsed: ${Date.now() - firstPassStart}ms`);

    if (!parsed) {
      console.error("Oracle generation failed after retry:", lastError);
      return jsonResponse(req, { error: "generation_failed" }, 502);
    }

    // ------------------------------------------------------------------
    // Research second pass — if Oracle asked for a lookup, run it and
    // re-invoke the gateway ONCE with the findings attached.
    // Every research call is bounded by RESEARCH_TIMEOUT_MS; on timeout
    // or error we proceed with whatever succeeded (possibly nothing).
    // ------------------------------------------------------------------
    const rr = parsed?.research_request;
    if (rr && typeof rr === "object") {
      const venueName = typeof rr.venue_name === "string" && rr.venue_name.trim() ? rr.venue_name.trim() : null;
      const eventName = typeof rr.event_name === "string" && rr.event_name.trim() ? rr.event_name.trim() : null;
      const weatherLoc =
        typeof rr.weather_location === "string" && rr.weather_location.trim() ? rr.weather_location.trim() : null;
      const weatherDate = typeof rr.weather_date === "string" && rr.weather_date.trim() ? rr.weather_date.trim() : null;

      if (venueName || eventName || weatherLoc) {
        console.log("Oracle research pass:", { venueName, eventName, weatherLoc, weatherDate });

        const runResearch = async (
          label: string,
          fn: () => Promise<{ data: any; error: any }>,
        ): Promise<{ data: any; error: any }> => {
          const started = Date.now();
          const result = await withTimeout(
            fn().catch((e) => ({ error: e, data: null })),
            RESEARCH_TIMEOUT_MS,
            label,
            { data: null, error: new Error("timeout") },
          );
          console.log(`[timing] ${label} elapsed: ${Date.now() - started}ms`);
          return result;
        };

        const [venueRes, eventRes, weatherRes] = await Promise.all([
          venueName
            ? runResearch("scrape-venue", () => supabase.functions.invoke("scrape-venue", { body: { venueName } }))
            : Promise.resolve({ data: null, error: null }),
          eventName
            ? runResearch("scrape-event", () => supabase.functions.invoke("scrape-event", { body: { eventName } }))
            : Promise.resolve({ data: null, error: null }),
          weatherLoc
            ? runResearch("weather-recommendations", () =>
                supabase.functions.invoke("weather-recommendations", {
                  body: weatherDate ? { location: weatherLoc, forecastDate: weatherDate } : { location: weatherLoc },
                }),
              )
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (!venueRes.error && venueRes.data) contextPayload.researched_venue = venueRes.data;
        if (!eventRes.error && eventRes.data) contextPayload.researched_event = eventRes.data;
        if (!weatherRes.error && weatherRes.data) contextPayload.confirmed_weather = weatherRes.data;

        // Re-invoke the gateway ONCE with enriched context.
        messages = buildMessages();
        const secondPassStart = Date.now();
        try {
          const secondResp = await callGateway(messages);
          if (secondResp.ok) {
            const secondJson = await secondResp.json().catch(() => null);
            if (secondJson) {
              try {
                const secondParsed = parseToolCall(secondJson);
                // Ignore any research_request on the second pass (no loops).
                secondParsed.research_request = null;
                sanitizeParsedResponse(secondParsed);
                parsed = secondParsed;
              } catch (err) {
                console.error("Research second-pass parse failed; keeping first response:", err);
              }
            }
          } else {
            console.error("Research second-pass gateway non-OK:", secondResp.status);
          }
        } catch (err) {
          console.error("Research second-pass gateway call failed:", err);
        }
        console.log(`[timing] second pass elapsed: ${Date.now() - secondPassStart}ms`);
      }
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
          const idValid = item.wardrobe_item_id != null && validIds.has(String(item.wardrobe_item_id));
          if (forceDowngrade || !idValid) {
            const reason = forceDowngrade
              ? `no wardrobe in scope (user=${!!user}, items=${wardrobeItems.length})`
              : `wardrobe_item_id missing or not in user's wardrobe`;
            console.warn(`Wardrobe validation: downgrading "${item?.name ?? "(unnamed)"}" — ${reason}`);
            item.source = "needs_purchase_or_rental";
            item.wardrobe_item_id = null;
          }
        }
      }
    }

    // Helper: run the same wardrobe-id validation on a parsed response.
    const runWardrobeValidation = (p: any) => {
      if (!Array.isArray(p?.outfit_options)) return;
      for (const opt of p.outfit_options) {
        if (!Array.isArray(opt?.items)) continue;
        for (const item of opt.items) {
          if (item?.source !== "from_wardrobe") continue;
          const idValid = item.wardrobe_item_id != null && validIds.has(String(item.wardrobe_item_id));
          if (forceDowngrade || !idValid) {
            item.source = "needs_purchase_or_rental";
            item.wardrobe_item_id = null;
          }
        }
      }
    };

    // Helper: does every outfit option include the anchor item?
    const anchorSatisfied = (p: any, anchorId: string): boolean => {
      if (!Array.isArray(p?.outfit_options) || p.outfit_options.length === 0) {
        return false;
      }
      return p.outfit_options.every(
        (opt: any) =>
          Array.isArray(opt?.items) &&
          opt.items.some(
            (it: any) => it?.source === "from_wardrobe" && String(it?.wardrobe_item_id ?? "") === String(anchorId),
          ),
      );
    };

    // Anchor enforcement: when an anchor is active, every option MUST contain
    // it. Retry generation once with an explicit reminder if not. If the retry
    // still fails, ship the response with anchor_enforced=false so the client
    // can hide misleading options — never fabricate the anchor into results.
    let anchor_enforced: boolean | undefined;
    if (effectiveAnchorId && anchorItem) {
      if (!anchorSatisfied(parsed, effectiveAnchorId)) {
        console.warn(`Anchor not enforced on first generation (anchor_item_id=${effectiveAnchorId}); retrying once`);
        const enforcementReminder = {
          role: "system" as const,
          content:
            "ANCHOR ENFORCEMENT (hard rule): the user tapped 'Style this' " +
            `on wardrobe item id=${anchorItem.id} (${anchorItem.name}). ` +
            "EVERY outfit_options entry you return MUST include an item " +
            'with source="from_wardrobe" and wardrobe_item_id equal to ' +
            `"${anchorItem.id}". Build each option AROUND this piece. Do ` +
            "not omit it from any option. Echo the same anchor_item_id in " +
            "your response.",
        };

        try {
          const retryResp = await callGateway([...messages, enforcementReminder]);
          if (retryResp.ok) {
            const retryJson = await retryResp.json().catch(() => null);
            if (retryJson) {
              try {
                const retryParsed = parseToolCall(retryJson);
                sanitizeParsedResponse(retryParsed);
                runWardrobeValidation(retryParsed);
                if (anchorSatisfied(retryParsed, effectiveAnchorId)) {
                  parsed = retryParsed;
                  anchor_enforced = true;
                } else {
                  console.warn(`Anchor still not enforced after retry (anchor_item_id=${effectiveAnchorId})`);
                  anchor_enforced = false;
                }
              } catch (err) {
                console.error("Anchor retry parse failed:", err);
                anchor_enforced = false;
              }
            } else {
              anchor_enforced = false;
            }
          } else {
            console.error("Anchor retry gateway non-OK:", retryResp.status);
            anchor_enforced = false;
          }
        } catch (err) {
          console.error("Anchor retry failed:", err);
          anchor_enforced = false;
        }
      } else {
        anchor_enforced = true;
      }
    }
    // ------------------------------------------------------------------
    // Phase 1: log the style brief (authenticated users only —
    // style_briefs.user_id is NOT NULL). matched is updated after search.
    // ------------------------------------------------------------------
    let briefId: string | null = null;
    if (user) {
      try {
        // NOTE: verify the jsonb key against a real row:
        //   select color_analysis from user_style_profiles
        //   where color_analysis is not null limit 1;
        const colorSeason: string | null =
          styleProfile?.color_analysis?.season ?? styleProfile?.color_analysis?.result?.season ?? null;

        const categories = Array.isArray(parsed.outfit_options)
          ? Array.from(
              new Set(
                parsed.outfit_options.flatMap((o: any) =>
                  Array.isArray(o?.items) ? o.items.map((i: any) => i?.category).filter(Boolean) : [],
                ),
              ),
            )
          : null;

        const { data: briefRow } = await supabase
          .from("style_briefs")
          .insert({
            user_id: user.id,
            mode: parsed.mode ?? null,
            occasion: accumulated_context?.occasion ?? null,
            budget_min: styleProfile?.budget_min ?? null,
            budget_max: styleProfile?.budget_max ?? null,
            currency: styleProfile?.budget_currency ?? "GBP",
            categories,
            color_season: colorSeason,
            brief: {
              user_message,
              mode: parsed.mode ?? null,
              styling_category: parsed.styling_category ?? null,
              colour_override: parsed.colour_override ?? false,
              wardrobe_check_result: parsed.wardrobe_check_result ?? null,
              anchor_item_id: effectiveAnchorId,
            },
            matched: null,
          })
          .select("id")
          .single();
        briefId = briefRow?.id ?? null;
      } catch (err) {
        console.warn("style_briefs insert failed (non-fatal):", err);
      }
    }
    // shop_new mode: auto-run product search for the primary option's
    // non-wardrobe items and attach { buy, rent } directly to each item.
    // Other options load on tap via the search_option action above.
    if (parsed.mode === "shop_new" && Array.isArray(parsed.outfit_options)) {
      const primary = parsed.outfit_options.find((o: any) => o?.is_primary === true);
      if (primary && Array.isArray(primary.items)) {
        const nonWardrobe = primary.items.filter((i: any) => i?.source !== "from_wardrobe");
        if (nonWardrobe.length > 0) {
          try {
            const searched = await searchItemsForOption(
              supabase,
              nonWardrobe,
              typeof parsed.rental_preference === "string" ? parsed.rental_preference : undefined,
              typeof parsed.styling_category === "string" ? parsed.styling_category : undefined,
            );
            const wrapped = wrapProductLinks(searched, user?.id ?? null, briefId);
            const byName = new Map(wrapped.map((s: any) => [s.name, s]));
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

    if (typeof anchor_enforced === "boolean") {
      parsed.anchor_enforced = anchor_enforced;
    }
    // Phase 1: matched = did this request end with genuinely usable results?
    if (briefId) {
      try {
        let matched = Array.isArray(parsed.outfit_options) && parsed.outfit_options.length > 0;
        if (matched && parsed.mode === "shop_new") {
          const primary = parsed.outfit_options.find((o: any) => o?.is_primary === true);
          const hasBuy = Array.isArray(primary?.items) &&
            primary.items.some((i: any) => Array.isArray(i?.buy) && i.buy.length > 0);
          matched = hasBuy;
        }
        await supabase.from("style_briefs").update({ matched }).eq("id", briefId);
      } catch (err) {
        console.warn("style_briefs matched update failed (non-fatal):", err);
      }
    }
    return jsonResponse(req, { success: true, data: parsed });
  } catch (err) {
    console.error("Oracle-styling unexpected error:", err);
    return jsonResponse(req, { error: "generation_failed" }, 502);
  }
});
