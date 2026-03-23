
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check for authentication but don't require it
    const authHeader = req.headers.get('Authorization');
    let user = null;
    let styleProfile = null;
    let wardrobeItems = null;
    let userEmail = null;

    if (authHeader) {
      try {
        const { data: { user: authUser }, error: userError } = await supabase.auth.getUser(
          authHeader.replace('Bearer ', '')
        );
        if (!userError && authUser) {
          user = authUser;
          userEmail = authUser.email;
        }
      } catch (authError) {
        console.log('Auth failed, proceeding as anonymous user:', authError);
      }
    }

    // If no authenticated user, require guest email for rate limiting
    const { 
      recommendationType = 'daily_outfit', 
      weatherData, 
      occasion, 
      eventDetails,
      guestEmail,
      conversationHistory = [],
      originalRequest = null,
      venueContext = null,
      eventContext = null,
      // New: vague venue / emotional tone context
      inferred_venue_formality = null,
      inferred_meal_type = null,
      inferred_occasion_type = null,
      emotional_tone = null,
      emotional_tone_label = null,
      is_multi_tone = false,
      // User's raw message for explicit shop intent detection
      user_message = null,
    } = await req.json();

    // Helper to parse AI JSON safely
    const parseAiJson = (response: any) => {
      const message = response.choices?.[0]?.message;
      if (message?.tool_calls?.[0]?.function?.arguments) {
        const args = message.tool_calls[0].function.arguments;
        return JSON.parse(typeof args === 'string' ? args : JSON.stringify(args));
      }
      const content = message?.content?.trim?.() || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      throw new Error('No valid response from AI');
    };

    // Determine email for rate limiting
    const rateLimitEmail = userEmail || guestEmail;
    if (!rateLimitEmail) {
      return new Response(JSON.stringify({ 
        error: 'Email required for AI recommendations. Please log in or provide a guest email.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check rate limiting - only for authenticated users (RPC expects UUID)
    let rateLimitResult = null;
    if (user?.id) {
      console.log('Checking rate limit for user:', user.id);
      const { data, error: rateLimitError } = await supabase.rpc('check_ai_rate_limit', {
        user_id_param: user.id
      });
      if (rateLimitError) {
        console.error('Rate limit check error:', rateLimitError);
      }
      rateLimitResult = data;
    }

    if (rateLimitResult && !rateLimitResult.allowed) {
      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded',
        details: {
          message: `You've reached your daily limit of ${rateLimitResult.limit || 10} AI recommendations.`,
          remaining: rateLimitResult.remaining || 0,
          reset_time: rateLimitResult.reset_at,
        }
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch user's style profile and wardrobe items if authenticated
    let userInsights = null;
    let recentFeedback = null;
    
    if (user) {
      const { data: userStyleProfile } = await supabase
        .from('user_style_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      styleProfile = userStyleProfile;

      const { data: userWardrobeItems } = await supabase
        .from('wardrobe_items')
        .select('*')
        .eq('user_id', user.id)
        .limit(50); // Increased to analyze more wardrobe items
      wardrobeItems = userWardrobeItems;

      // Fetch user preference insights from feedback
      const { data: insights } = await supabase
        .from('user_preference_insights')
        .select('*')
        .eq('user_id', user.id)
        .order('confidence_score', { ascending: false })
        .limit(10);
      userInsights = insights;

      // Fetch recent feedback to understand what worked/didn't work
      const { data: feedback } = await supabase
        .from('recommendation_feedback')
        .select(`
          rating,
          liked_aspects,
          disliked_aspects,
          improvement_suggestions,
          ai_recommendations (
            recommended_items,
            occasion
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      recentFeedback = feedback;
    }

    // Fetch recent shopping items for inspiration
    const { data: shoppingItems } = await supabase
      .from('shopping_items')
      .select('name, brand, category, price, colors, description')
      .eq('in_stock', true)
      .order('created_at', { ascending: false })
      .limit(15);

    // Fetch cultural dress norms if a country is mentioned
    let culturalNorms: any[] = [];
    const countryDetectionText = [occasion, venueContext?.venue_name, eventContext?.event_name, weatherData?.location].filter(Boolean).join(' ');
    const knownCountries = ['France', 'Spain', 'United States', 'China', 'Italy', 'Turkey', 'Mexico', 'Thailand', 'Germany', 'United Kingdom', 'Austria', 'Malaysia', 'Greece', 'Japan', 'Portugal', 'Canada', 'Poland', 'Netherlands', 'United Arab Emirates', 'India', 'Croatia', 'Saudi Arabia', 'South Korea', 'Hungary', 'Czech Republic', 'Morocco', 'Indonesia', 'Egypt', 'Singapore', 'Vietnam'];
    const cityToCountry: Record<string, string> = {
      'London': 'United Kingdom', 'Paris': 'France', 'Madrid': 'Spain', 'Barcelona': 'Spain',
      'Rome': 'Italy', 'Milan': 'Italy', 'Florence': 'Italy', 'Venice': 'Italy',
      'Tokyo': 'Japan', 'Osaka': 'Japan', 'Kyoto': 'Japan',
      'Dubai': 'United Arab Emirates', 'Abu Dhabi': 'United Arab Emirates',
      'Bangkok': 'Thailand', 'Istanbul': 'Turkey', 'Berlin': 'Germany', 'Munich': 'Germany',
      'Amsterdam': 'Netherlands', 'Prague': 'Czech Republic', 'Budapest': 'Hungary',
      'Marrakech': 'Morocco', 'Cairo': 'Egypt', 'Bali': 'Indonesia', 'Jakarta': 'Indonesia',
      'Seoul': 'South Korea', 'Beijing': 'China', 'Shanghai': 'China',
      'Mumbai': 'India', 'Delhi': 'India', 'New Delhi': 'India',
      'Riyadh': 'Saudi Arabia', 'Jeddah': 'Saudi Arabia',
      'Kuala Lumpur': 'Malaysia', 'Athens': 'Greece', 'Lisbon': 'Portugal',
      'Warsaw': 'Poland', 'Krakow': 'Poland', 'Zagreb': 'Croatia', 'Dubrovnik': 'Croatia',
      'Ho Chi Minh': 'Vietnam', 'Hanoi': 'Vietnam', 'Mexico City': 'Mexico', 'Cancun': 'Mexico',
      'Toronto': 'Canada', 'Vancouver': 'Canada', 'Vienna': 'Austria', 'Salzburg': 'Austria',
      'New York': 'United States', 'Los Angeles': 'United States', 'Chicago': 'United States',
    };
    
    let detectedCountry: string | null = null;
    // Check city names first (more specific)
    for (const [city, country] of Object.entries(cityToCountry)) {
      if (countryDetectionText.toLowerCase().includes(city.toLowerCase())) {
        detectedCountry = country;
        break;
      }
    }
    // Then check country names
    if (!detectedCountry) {
      for (const country of knownCountries) {
        if (countryDetectionText.toLowerCase().includes(country.toLowerCase())) {
          detectedCountry = country;
          break;
        }
      }
    }

    if (detectedCountry) {
      console.log('Detected country for cultural norms:', detectedCountry);
      const { data: norms } = await supabase
        .from('cultural_dress_norms')
        .select('context_type, guidance')
        .eq('country', detectedCountry);
      if (norms && norms.length > 0) {
        culturalNorms = norms;
        console.log(`Found ${norms.length} cultural dress norms for ${detectedCountry}`);
      }
    }

// Enhanced AI prompt with more context
    const prompt = `You are an expert fashion stylist and costume consultant with deep knowledge of fashion trends, literary characters, theatrical costume design, and themed party styling. Create a highly personalized outfit recommendation.

YOUR PRIORITY FRAMEWORK — FOLLOW THIS EXACT ORDER:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIORITY 1 — DRESS CODE (non-negotiable constraint)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If a dress code exists — explicit or strongly implied by the venue, event, or occasion — it MUST be met first. No recommendation should violate a known dress code. Examples:
- Black tie → full formal, no exceptions
- Smart casual → no trainers, no shorts
- Conservative country/religious setting → covered shoulders and knees minimum
If NO dress code exists or can be inferred, move directly to Priority 2.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIORITY 2 — VISUAL ENVIRONMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Within the dress code constraint, reason about what will look visually STUNNING in the specific setting:
- Lighting: candlelit dinner? outdoor golden hour? neon-lit bar? gallery spotlights? Consider how fabrics catch light, how colours shift under different lighting.
- Visual backdrop: beach, city skyline, rustic interior, modern minimalist space, lush garden, white architecture. Choose pieces that complement or deliberately contrast with the setting.
- Colour palette of the setting: recommend colours that will photograph well and stand out (or blend elegantly) against the likely environment. A burgundy dress pops against white minimalist interiors; pastels glow in golden-hour garden light.
- Whether the setting is photography-heavy — how the outfit reads on camera, flash-friendly fabrics, patterns that photograph well.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIORITY 3 — EMOTIONAL GOAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Within the above constraints, reason about how the user wants to FEEL:
- Date night → romantic, attractive, effortless
- Girls night out → fun, confident, memorable
- Work/networking → authoritative, polished
- Family occasion → appropriate but still stylish
- Solo/performance → expressive, ownable
The emotional goal may be provided as a user selection. If no selection was made, infer it from the occasion and proceed — do NOT ask again. Every item should serve this emotional goal.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIORITY 4 — PHYSICAL CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Practical considerations applied last:
- Standing all night vs seated dinner — comfort in shoes, fabric drape
- Dancing vs dining — movement, breathability, will the outfit restrict or flow?
- Indoor to outdoor transitions — layering strategy, temperature shifts
- Weather and temperature
- Comfort for duration of event

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Lead the recommendation with ONE sentence that references the specific setting and emotional goal — NEVER a generic opener like "Here's what I'd suggest" or "For this occasion".
Then give the outfit recommendation.
Then add any dress code or practical notes as a brief footnote — NOT the headline.


USER STYLE PROFILE:
- Body Type: ${styleProfile?.body_type || 'Not specified'}
- Preferred Colors: ${styleProfile?.preferred_colors?.join(', ') || 'None specified'}
- Disliked Colors: ${styleProfile?.disliked_colors?.join(', ') || 'None specified'}
- Style Personality: ${styleProfile?.style_personality?.join(', ') || 'None specified'}
- Preferred Patterns: ${styleProfile?.preferred_patterns?.join(', ') || 'None specified'}
- Preferred Fabrics: ${styleProfile?.preferred_fabrics?.join(', ') || 'None specified'}
- Preferred Brands: ${styleProfile?.preferred_brands?.join(', ') || 'None specified'}
- Budget Range: $${styleProfile?.budget_min || 0} - $${styleProfile?.budget_max || 1000}
- Style Confidence: ${styleProfile?.style_confidence_score ? Math.round(styleProfile.style_confidence_score * 100) + '%' : 'Not specified'}
- Height: ${styleProfile?.height_cm ? styleProfile.height_cm + 'cm' : 'Not specified'}
- Size Preferences: Top ${styleProfile?.standard_size_top || 'N/A'}, Bottom ${styleProfile?.standard_size_bottom || 'N/A'}, Shoes ${styleProfile?.standard_size_shoes || 'N/A'}

LEARNED PREFERENCES FROM FEEDBACK:
${userInsights?.length > 0 ? userInsights.map(insight => 
  `- ${insight.insight_type}: ${JSON.stringify(insight.insight_data)} (confidence: ${Math.round(insight.confidence_score * 100)}%)`
).join('\n') : '- No learned preferences yet'}

RECENT FEEDBACK ANALYSIS:
${recentFeedback?.length > 0 ? recentFeedback.map(fb => {
  const ratingText = fb.rating >= 4 ? 'POSITIVE' : fb.rating === 3 ? 'NEUTRAL' : 'NEGATIVE';
  return `- ${ratingText} (${fb.rating}/5): Liked: ${fb.liked_aspects?.join(', ') || 'none'}, Disliked: ${fb.disliked_aspects?.join(', ') || 'none'}${fb.improvement_suggestions ? `, Suggestions: ${fb.improvement_suggestions}` : ''}`;
}).join('\n') : '- No previous feedback available'}

USER'S WARDROBE ITEMS (PRIORITIZE USING THESE):
${wardrobeItems?.length > 0 ? wardrobeItems.map(item => `- ${item.name} (${item.category}, ${item.color || 'color not specified'}, ${item.brand || 'brand not specified'}${item.notes ? ', notes: ' + item.notes : ''})`).join('\n') : `The user has not uploaded their wardrobe yet.
Do not reference any existing clothing items.
Instead, recommend a complete outfit for the occasion from scratch — describe each item specifically (type, color, style, material where relevant) and explain why it works for this specific occasion, venue, weather, and emotional goal. Be specific enough that the user could search for and buy each item.
Set the "source" for EVERY item to "needs_purchase" and include a corresponding entry in "missing_items_search" for each one.`}

CRITICAL WARDROBE INTEGRATION INSTRUCTIONS:
${wardrobeItems?.length > 0 ? `1. ALWAYS analyze the user's wardrobe items FIRST
2. If the user has suitable wardrobe items for any part of the outfit (top, bottom, shoes, outerwear, accessories), PRIORITIZE using those items
3. Only suggest purchasing/renting items that the user doesn't already own or when their wardrobe lacks suitable options
4. For each outfit piece, explicitly state whether it's "from_wardrobe" or "needs_purchase_or_rental"
5. Create a balanced mix: use existing wardrobe items where appropriate, and suggest strategic purchases/rentals to complete the look` : `1. The user has NO wardrobe items — every item you recommend must have source "needs_purchase"
2. Include ALL recommended items in "missing_items_search" so real products can be found
3. Be extra specific in item descriptions so product searches return accurate results`}

${originalRequest ? `
🔄 THIS IS A FOLLOW-UP REQUEST - PRESERVE ORIGINAL CONTEXT 🔄

ORIGINAL REQUEST (DO NOT OVERRIDE): ${originalRequest}

CONVERSATION HISTORY:
${conversationHistory?.map((m: any) => `${m.role.toUpperCase()}: ${m.content}${m.recommendationSummary ? ` [Recommended: ${m.recommendationSummary.items?.join(', ')} for ${m.recommendationSummary.occasion}]` : ''}`).join('\n') || 'No previous messages'}

USER'S MODIFICATION: ${occasion}

CRITICAL INSTRUCTIONS FOR FOLLOW-UP:
- Keep ALL details from the original request (dress code, event type, style, formality level)
- ONLY modify what the user explicitly asks to change in their modification
- If user says "female" or "woman", keep the SAME dress code/style but make it for women
- If user says "male" or "man", keep the SAME dress code/style but make it for men
- If user asks to change formality, keep gender and other details the same
- DO NOT start from scratch - this is a refinement of the previous recommendation
` : `OCCASION: ${occasion || 'Daily casual wear'}`}

${eventDetails ? `
EVENT DETAILS:
- Event: ${originalRequest || eventDetails.name}
- Location: ${eventDetails.location || 'Not specified'}
- Dress Code: ${eventDetails.dressCode || 'Smart Casual'}
- Event Type: ${eventDetails.type || 'General'}
` : ''}

WEATHER CONTEXT:
${weatherData ? `Temperature: ${weatherData.temperature}°F, Condition: ${weatherData.condition}, Humidity: ${weatherData.humidity}%, Location: ${weatherData.location}` : 'Weather not specified'}

${venueContext?.source === 'scraped' ? `
🏢 VENUE INTELLIGENCE (scraped from venue website - USE THIS):
- Venue: ${venueContext.venue_name || 'Unknown'}
- Type: ${venueContext.venue_type || 'Unknown'}
- Dress Code: ${venueContext.dress_code || 'Not specified'} ${venueContext.dress_code_details ? `(${venueContext.dress_code_details})` : ''}
- Atmosphere: ${venueContext.atmosphere || 'Not specified'}
- Formality Level: ${venueContext.formality_level || 'N/A'}/10
- Style Keywords: ${venueContext.style_keywords?.join(', ') || 'None'}
- Additional Notes: ${venueContext.notes || 'None'}

CRITICAL: This venue information was scraped from the actual venue's website. You MUST tailor the outfit recommendation to match this venue's specific dress code and atmosphere. This takes priority over generic occasion-based styling.
` : venueContext?.source === 'name_only' ? `
🏢 VENUE MENTIONED: "${venueContext.venue_name}"${venueContext.venue_type ? ` (${venueContext.venue_type})` : ''}

We could not scrape the venue's website for dress code details. Use your own knowledge of this venue (or similar venues with this name) to infer the likely dress code, formality level, and atmosphere. Factor this into the outfit recommendation. If you don't recognise the venue, make reasonable assumptions based on the venue type and location context from the user's message.
` : ''}

${inferred_venue_formality ? `
🏠 INFERRED VENUE CONTEXT (no specific venue named):
- Inferred Formality: ${inferred_venue_formality}
- Meal Type: ${inferred_meal_type || 'not specified'}
- Social Context: ${inferred_occasion_type || 'not specified'}

The user described a vague venue (e.g. "nice restaurant", "fancy place"). There is NO specific venue to look up. Use the inferred formality level and context to guide your recommendation. Do NOT ask for more details — provide a confident recommendation based on these cues.
` : ''}

${emotional_tone ? `
🎭 EMOTIONAL TONE (${is_multi_tone ? 'generating one of multiple options' : 'user-specified'}):
Target emotional feeling: "${emotional_tone_label || emotional_tone}"

${is_multi_tone ? `You are generating ONE specific outfit for the "${emotional_tone_label}" emotional direction. Make this outfit DISTINCT from other emotional tones — not just a colour swap. The silhouette, key pieces, and overall styling approach should genuinely reflect this specific mood.` : `The user wants to feel "${emotional_tone_label || emotional_tone}". Every item should serve this emotional goal. Lead with the feeling, not the dress code.`}
` : ''}

${eventContext?.source === 'scraped' ? `
🎫 EVENT INTELLIGENCE (scraped from event website - USE THIS):
- Event: ${eventContext.event_name || 'Unknown'}
- Type: ${eventContext.event_type || 'Unknown'}
- Dress Code: ${eventContext.dress_code || 'Not specified'} ${eventContext.dress_code_details ? `(${eventContext.dress_code_details})` : ''}
- Setting: ${eventContext.indoor_outdoor || 'Unknown'}
- Time: ${eventContext.time_of_day || 'Unknown'}
- Style Guidance: ${eventContext.style_guidance || 'None'}
- Formality Level: ${eventContext.formality_level || 'N/A'}/10
- Style Keywords: ${eventContext.style_keywords?.join(', ') || 'None'}
- Practical Notes: ${eventContext.practical_notes || 'None'}

CRITICAL: This event information was scraped from the actual event's website. You MUST tailor the outfit recommendation to match this event's specific dress code, setting (indoor/outdoor), and time of day. If the event is outdoor, consider layering and practical footwear. If evening, lean more formal. This takes priority over generic occasion-based styling.
` : eventContext?.source === 'name_only' ? `
🎫 EVENT MENTIONED: "${eventContext.event_name}"${eventContext.event_type ? ` (${eventContext.event_type})` : ''}

We could not scrape the event's website for details. Use your own knowledge of this event to infer the likely dress code, setting (indoor/outdoor), time of day, and formality level. Factor this into the outfit recommendation. If you don't recognise the event, make reasonable assumptions based on the event type.
` : ''}

${(eventContext && venueContext) ? `
⚖️ DRESS CODE PRIORITY (when both event and venue context exist):
1. Explicit dress code from the scraped EVENT page (highest priority)
2. Venue formality and atmosphere from the scraped VENUE page
3. Event type inferred from the user's message
4. Your general knowledge (fallback)
If the event dress code conflicts with the venue dress code, follow the EVENT dress code. Use the venue context for atmosphere and styling cues.
` : ''}

${culturalNorms.length > 0 ? `
🌍 CULTURAL DRESS NORMS FOR ${detectedCountry?.toUpperCase()} (from travel research - FOLLOW THESE):
${culturalNorms.map(n => `**${n.context_type.replace(/_/g, ' ').toUpperCase()}:** ${n.guidance.slice(0, 500)}`).join('\n\n')}

CRITICAL: These are real cultural dress expectations for ${detectedCountry}. Your outfit recommendation MUST respect these norms. If modesty is expected, do not suggest revealing clothing. If religious site dress codes apply and the user mentions visiting temples/mosques/churches, ensure the outfit complies.
` : ''}

🚫 ABSOLUTE PROHIBITION FOR HISTORICAL/THEMED EVENTS 🚫
${(occasion?.toLowerCase().includes('1930') || occasion?.toLowerCase().includes('1920') || occasion?.toLowerCase().includes('1940') || occasion?.toLowerCase().includes('victorian') || occasion?.toLowerCase().includes('vintage') || occasion?.toLowerCase().includes('period') || eventDetails?.description?.toLowerCase().includes('1930') || eventDetails?.description?.toLowerCase().includes('1920')) ? `
⛔ THIS IS A HISTORICAL PERIOD EVENT - MODERN ITEMS ARE STRICTLY FORBIDDEN ⛔

NEVER SUGGEST ANY OF THE FOLLOWING MODERN ITEMS:
- Jeans, denim pants, or any casual denim
- Sneakers, trainers, athletic shoes, or modern footwear
- T-shirts, hoodies, sweatshirts, or casual modern tops
- Modern midi dresses that aren't period-cut
- Contemporary shirt dresses, wrap dresses, or modern silhouettes
- Athleisure, sportswear, or casual modern wear
- Modern boots (unless authentic period style like Victorian lace-up boots)
- Baseball caps, modern accessories
- Any clothing item invented after the specified historical period

ONLY SUGGEST:
- Authentic period garments (bias-cut gowns for 1930s, drop-waist for 1920s, etc.)
- Period-appropriate shoes (T-strap heels, Mary Janes, Oxford pumps from that era)
- Historically accurate accessories (period hats, gloves, beaded bags, fur stoles)
- Vintage or reproduction pieces that are true to the era
- Items from costume shops, vintage specialists, or period fashion retailers

IF YOU SUGGEST MODERN ITEMS LIKE JEANS OR SNEAKERS FOR A HISTORICAL EVENT, THE RECOMMENDATION WILL BE REJECTED.
` : ''}

STYLING BRIEF:
${recommendationType === 'event_outfit' ? 
  `Create an outfit specifically tailored for this event. ${(occasion?.toLowerCase().includes('1930') || occasion?.toLowerCase().includes('1920') || occasion?.toLowerCase().includes('1940') || eventDetails?.description?.toLowerCase().includes('1930') || eventDetails?.description?.toLowerCase().includes('1920')) ? '⚠️ CRITICAL HISTORICAL ACCURACY REQUIRED ⚠️: This is a PERIOD EVENT. Every single item must be authentically from or accurately reproduce the specified historical era. Modern clothing is FORBIDDEN.' : ''} ${eventDetails?.description || occasion || ''}` :
  'Create a versatile daily outfit that reflects the user\'s personal style while being practical for their lifestyle.'
}

HISTORICAL ACCURACY REQUIREMENTS (when applicable):
If the occasion mentions "1930s", "1920s", "1940s" or any historical period:
- 1930s: bias-cut silk gowns, midi-to-floor length, Art Deco beading, T-strap heels, cloche or wide-brimmed hats, fur stoles, satin fabrics
- 1920s: drop-waist dresses, knee-length, fringe, beading, feather headbands, Mary Jane heels
- 1940s: structured shoulders, A-line skirts, victory rolls, utility fashion, peep-toe pumps
- Suggest ONLY vintage shops, costume rental platforms (HURR, By Rotation with period sections), theatrical costume shops
- Reference authentic period fashion icons and designers from that exact era

CRITICAL: Use the learned preferences and recent feedback to improve this recommendation. Pay special attention to:
1. Aspects the user consistently likes/dislikes from previous feedback
2. Learned preferences with high confidence scores
3. Improvement suggestions from past recommendations
4. Color, style, and fit preferences that have been reinforced through positive feedback

Please provide a detailed outfit recommendation in the following JSON format:
{
  "character_suggestions": [
    {
      "name": "Character Name",
      "source": "Book/Play/Movie",
      "description": "Brief description of character and their style",
      "difficulty": "Easy/Medium/Hard",
      "why_perfect": "Why this character fits the theme and user"
    }
  ],
  "wardrobe_analysis": {
    "items_used": ["List wardrobe items that fit this outfit"],
    "gaps_identified": ["What's missing from wardrobe for this occasion"],
    "coverage_score": 0.6
  },
  "recommended_items": {
    "top": { 
      "name": "specific item name", 
      "source": "from_wardrobe" OR "needs_purchase" OR "needs_rental",
      "wardrobe_item_id": "actual wardrobe item name if from_wardrobe, null otherwise",
      "confidence": 0.9, 
      "reasoning": "detailed explanation of why this works for the user's body type, style preferences, and occasion",
      "styling_tips": "how to wear this piece effectively",
      "alternatives": ["alternative option 1", "alternative option 2"],
      "character_connection": "how this relates to the suggested character if themed",
      "purchase_options": {
        "uk_retailers": [
          {
            "store": "Store name (e.g., ASOS, Zara, Selfridges)",
            "price_range": "£50-100",
            "url": "https://direct-link-to-search-or-category",
            "notes": "Why this retailer is good for this item"
          }
        ],
        "rental_platforms": [
          {
            "platform": "Platform name (e.g., HURR, By Rotation, Rent the Runway)",
            "price_range": "£20-40 rental",
            "url": "https://direct-link",
            "notes": "Rental duration and benefits"
          }
        ],
        "vintage_options": [
          {
            "source": "Vintage store or online marketplace",
            "price_range": "£30-80",
            "url": "https://link-to-search",
            "notes": "What to look for"
          }
        ]
      }
    },
    "bottom": { 
      "name": "specific item name",
      "source": "from_wardrobe" OR "needs_purchase" OR "needs_rental",
      "wardrobe_item_id": "actual wardrobe item name if from_wardrobe, null otherwise",
      "confidence": 0.85, 
      "reasoning": "detailed explanation",
      "styling_tips": "how to style this piece",
      "alternatives": ["alternative option 1", "alternative option 2"],
      "character_connection": "how this relates to the suggested character if themed",
      "purchase_options": {
        "uk_retailers": [],
        "rental_platforms": [],
        "vintage_options": []
      }
    },
    "shoes": { 
      "name": "specific item name",
      "source": "from_wardrobe" OR "needs_purchase" OR "needs_rental",
      "wardrobe_item_id": "actual wardrobe item name if from_wardrobe, null otherwise",
      "confidence": 0.8, 
      "reasoning": "detailed explanation",
      "styling_tips": "how to choose and style shoes",
      "alternatives": ["alternative option 1", "alternative option 2"],
      "character_connection": "how this relates to the suggested character if themed",
      "purchase_options": {
        "uk_retailers": [],
        "rental_platforms": [],
        "vintage_options": []
      }
    },
    "accessories": [
      { 
        "name": "specific accessory name",
        "source": "from_wardrobe" OR "needs_purchase" OR "needs_rental",
        "wardrobe_item_id": "actual wardrobe item name if from_wardrobe, null otherwise",
        "confidence": 0.7, 
        "reasoning": "why this accessory complements the outfit",
        "styling_tips": "how to incorporate this accessory",
        "character_connection": "how this relates to the suggested character if themed",
        "purchase_options": {
          "uk_retailers": [],
          "rental_platforms": [],
          "vintage_options": []
        }
      }
    ],
    "outerwear": { 
      "name": "specific outerwear name",
      "source": "from_wardrobe" OR "needs_purchase" OR "needs_rental",
      "wardrobe_item_id": "actual wardrobe item name if from_wardrobe, null otherwise",
      "confidence": 0.75, 
      "reasoning": "weather and style considerations",
      "styling_tips": "layering advice",
      "alternatives": ["alternative option 1", "alternative option 2"],
      "character_connection": "how this relates to the suggested character if themed",
      "purchase_options": {
        "uk_retailers": [],
        "rental_platforms": [],
        "vintage_options": []
      }
    }
  },
  "missing_items_search": [
    {
      "item_type": "navy midi dress",
      "style_descriptor": "elegant, fitted",
      "occasion_suitability": "smart casual to formal",
      "price_tier": "budget|mid_range|luxury",
      "category": "dresses|tops|bottoms|shoes|outerwear|accessories|knitwear|bags",
      "search_keywords": ["navy", "midi", "dress", "fitted"]
    }
  ],
  "overall_confidence": 0.87,
  "style_reasoning": "Open with ONE sentence referencing the specific setting and emotional goal — never a generic opener. Then describe how the outfit will look in that lighting and backdrop, what emotional impact it creates, and how colours/silhouettes work with the environment. Add any dress code compliance or practical notes as a brief footnote at the end — never the headline.",
  "color_analysis": "Detailed explanation of color choices and how they work with the user's preferences and complexion",
  "fit_guidance": "Specific advice on fit and silhouette based on body type and preferences",
  "styling_tips": [
    "Professional tip 1 about proportions and silhouette",
    "Practical advice about comfort and functionality", 
    "Style enhancement tip about accessories or details",
    "Maintenance or care tip for the recommended pieces"
  ],
  "alternative_options": {
    "if_cooler": "Specific layering suggestions if temperature drops",
    "if_warmer": "Modifications for warmer weather",
    "dressy_version": "How to elevate this look for more formal occasions",
    "casual_version": "How to dress down for more relaxed settings",
    "budget_friendly": "More affordable alternatives that achieve similar look",
    "investment_pieces": "Key items worth investing in for long-term wardrobe building"
  },
  "shopping_suggestions": {
    "priority_items": ["item 1 to buy/rent first", "item 2 to buy/rent second"],
    "total_investment_needed": "£X-Y for purchases, £A-B for rentals",
    "wardrobe_utilization": "X% of outfit uses existing wardrobe items",
    "recommended_approach": "Buy key pieces, rent special occasion items, use existing wardrobe for basics",
    "uk_shopping_guide": {
      "high_street_stores": {
        "ASOS": {
          "url": "https://www.asos.com",
          "best_for": "Specific categories this retailer excels at",
          "price_point": "Budget to mid-range"
        },
        "Zara": {
          "url": "https://www.zara.com/uk",
          "best_for": "Trend-focused pieces",
          "price_point": "Mid-range"
        },
        "H&M": {
          "url": "https://www2.hm.com/en_gb",
          "best_for": "Affordable basics and trend pieces",
          "price_point": "Budget"
        },
        "& Other Stories": {
          "url": "https://www.stories.com/en_gbp",
          "best_for": "Elevated everyday pieces",
          "price_point": "Mid-range"
        }
      },
      "rental_platforms": {
        "HURR": {
          "url": "https://www.hurrcollective.com",
          "best_for": "Designer pieces and special occasions",
          "rental_duration": "4-8-20 days",
          "price_range": "£20-£150"
        },
        "By Rotation": {
          "url": "https://www.byrotation.com",
          "best_for": "Peer-to-peer rentals, trendy pieces",
          "rental_duration": "Flexible",
          "price_range": "£15-£100"
        },
        "ROTARO": {
          "url": "https://www.rotaro.co.uk",
          "best_for": "Premium and sustainable brands",
          "rental_duration": "4-8 days",
          "price_range": "£25-£120"
        }
      },
      "vintage_and_period": {
        "Beyond Retro": {
          "url": "https://www.beyondretro.com",
          "best_for": "Authentic vintage pieces",
          "locations": "Multiple London locations + online"
        },
        "Rokit": {
          "url": "https://www.rokit.co.uk",
          "best_for": "Curated vintage clothing",
          "locations": "London locations + online"
        },
        "Etsy UK": {
          "url": "https://www.etsy.com/uk/c/vintage",
          "best_for": "Specific era pieces from independent sellers",
          "search_tip": "Search '[decade] dress UK' for period pieces"
        }
      },
      "department_stores": {
        "Selfridges": {
          "url": "https://www.selfridges.com",
          "best_for": "Luxury and designer pieces",
          "price_point": "High-end"
        },
        "John Lewis": {
          "url": "https://www.johnlewis.com",
          "best_for": "Quality classics and occasionwear",
          "price_point": "Mid to high"
        }
      }
    },
    "costume_and_theatrical": {
      "Angels Fancy Dress": {
        "url": "https://www.fancydress.com",
        "best_for": "Professional costume hire and purchase",
        "notes": "Extensive period costume collection"
      },
      "Escapade": {
        "url": "https://www.escapade.co.uk",
        "best_for": "Themed party costumes and accessories",
        "notes": "Good for 1920s-1950s pieces"
      }
    }
  }
}

Focus on creating a cohesive, stylish outfit that authentically represents the user's personal style while being appropriate for the occasion and weather. 

CRITICAL FINAL INSTRUCTIONS:
1. WARDROBE FIRST: Always check if the user has suitable items in their wardrobe before suggesting purchases
2. SMART MIXING: Create outfits that combine existing wardrobe items with strategic new purchases or rentals
3. REAL LINKS: Provide actual URLs to UK retailers, rental platforms, and vintage shops - not generic suggestions
4. VALUE OPTIMIZATION: Help users maximize their existing wardrobe while strategically filling gaps
5. For period/themed events: Provide specific links to costume rental shops and vintage stores with authentic pieces
6. Price transparency: Always include price ranges for both purchase and rental options in GBP (£)
7. MISSING ITEMS: For every item with source "needs_purchase" or "needs_rental", you MUST include a corresponding entry in "missing_items_search" with:
   - item_type: specific item description (e.g. "navy midi dress")
   - style_descriptor: 2-3 style keywords (e.g. "elegant, fitted")
   - occasion_suitability: formality range (e.g. "smart casual to formal")
   - price_tier: based on user budget profile - "budget" (under £50), "mid_range" (£50-150), or "luxury" (£150+)
   - category: one of dresses, tops, bottoms, shoes, outerwear, accessories, knitwear, bags
   - search_keywords: array of 3-5 keywords for database search

Remember: The goal is to create perfect, achievable outfits using what the user owns + targeted shopping/rental recommendations with real, clickable links.`;

    // Dynamic model selection and stricter validation for historical/themed events
    const occ = (occasion || '').toLowerCase();
    const desc = (eventDetails?.description || '').toLowerCase();
    const isHistorical = /(1920|1930|1940|victorian|edwardian|regency|vintage|period)/.test(`${occ} ${desc}`);
    // Use GPT-5 Mini for faster responses - still high quality but more efficient
    const model = 'openai/gpt-5-mini';

    // Define tool for structured output
    const outfitTool = {
      type: 'function',
      function: {
        name: 'provide_outfit_recommendation',
        description: 'Provide a detailed outfit recommendation with all required fields',
        parameters: {
          type: 'object',
          properties: {
            recommended_items: {
              type: 'object',
              properties: {
                top: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Specific item name - for historical events use period-accurate pieces only' },
                    source: { type: 'string', enum: ['from_wardrobe', 'needs_purchase', 'needs_rental'] },
                    confidence: { type: 'number' },
                    reasoning: { type: 'string', description: 'Why this item works for the user and occasion' },
                    styling_tips: { type: 'string' },
                    purchase_options: {
                      type: 'object',
                      properties: {
                        uk_retailers: { type: 'array', items: { type: 'object', properties: { store: { type: 'string' }, price_range: { type: 'string' }, url: { type: 'string' } } } },
                        rental_platforms: { type: 'array', items: { type: 'object', properties: { platform: { type: 'string' }, price_range: { type: 'string' }, url: { type: 'string' } } } },
                        vintage_options: { type: 'array', items: { type: 'object', properties: { source: { type: 'string' }, price_range: { type: 'string' }, url: { type: 'string' } } } }
                      }
                    }
                  },
                  required: ['name', 'confidence', 'reasoning', 'styling_tips']
                },
                bottom: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    source: { type: 'string', enum: ['from_wardrobe', 'needs_purchase', 'needs_rental'] },
                    confidence: { type: 'number' },
                    reasoning: { type: 'string' },
                    styling_tips: { type: 'string' },
                    purchase_options: { type: 'object' }
                  },
                  required: ['name', 'confidence', 'reasoning', 'styling_tips']
                },
                shoes: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    source: { type: 'string', enum: ['from_wardrobe', 'needs_purchase', 'needs_rental'] },
                    confidence: { type: 'number' },
                    reasoning: { type: 'string' },
                    styling_tips: { type: 'string' },
                    purchase_options: { type: 'object' }
                  },
                  required: ['name', 'confidence', 'reasoning', 'styling_tips']
                },
                accessories: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      confidence: { type: 'number' },
                      reasoning: { type: 'string' },
                      styling_tips: { type: 'string' }
                    }
                  }
                },
                outerwear: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    confidence: { type: 'number' },
                    reasoning: { type: 'string' },
                    styling_tips: { type: 'string' }
                  }
                }
              },
              required: ['top', 'bottom', 'shoes']
            },
            overall_confidence: { type: 'number', description: 'Overall confidence score 0-1' },
            style_reasoning: { type: 'string', description: 'Comprehensive explanation of outfit choices' },
            color_analysis: { type: 'string' },
            fit_guidance: { type: 'string' },
            styling_tips: { type: 'array', items: { type: 'string' } },
            shopping_suggestions: {
              type: 'object',
              properties: {
                priority_items: { type: 'array', items: { type: 'string' } },
                total_investment_needed: { type: 'string' },
                wardrobe_utilization: { type: 'string' }
              }
            },
            missing_items_search: {
              type: 'array',
              description: 'Structured search data for each item the user needs to buy or rent',
              items: {
                type: 'object',
                properties: {
                  item_type: { type: 'string', description: 'Specific item description e.g. navy midi dress' },
                  style_descriptor: { type: 'string', description: 'Style keywords e.g. elegant, fitted' },
                  occasion_suitability: { type: 'string', description: 'Formality range e.g. smart casual to formal' },
                  price_tier: { type: 'string', enum: ['budget', 'mid_range', 'luxury'] },
                  category: { type: 'string' },
                  search_keywords: { type: 'array', items: { type: 'string' } }
                },
                required: ['item_type', 'style_descriptor', 'category', 'search_keywords']
              }
            }
          },
          required: ['recommended_items', 'overall_confidence', 'style_reasoning', 'styling_tips', 'missing_items_search']
        }
      }
    };

    const systemPrompt = isHistorical
      ? `You are an expert fashion historian and costume consultant specializing in period-accurate clothing. For this ${occ.includes('1930') ? '1930s' : occ.includes('1920') ? '1920s' : occ.includes('1940') ? '1940s' : 'historical'} event, you MUST only recommend authentic period pieces. NEVER suggest: jeans, denim, sneakers, trainers, t-shirts, hoodies, modern midi dresses, or any item invented after the specified era. Focus on: bias-cut gowns, T-strap heels, Art Deco accessories, vintage shops, and costume rentals.`
      : emotional_tone
        ? `You are a world-class fashion stylist. The user wants to feel "${emotional_tone_label || emotional_tone}". Every piece you recommend should serve this emotional goal. Lead with the feeling — how the outfit makes the user FEEL in the setting — not generic styling advice. Be conversational and warm, never clinical. Never ask the user for more information — use your expert judgment.`
        : inferred_venue_formality
          ? `You are a world-class fashion stylist. The user described a vague venue or occasion. You should NEVER ask for more details or say you need more information. Use the context clues provided (formality level, meal type, occasion type) to make a confident, expert recommendation. Be conversational and warm. Open with a sentence that acknowledges the specific vibe, not a generic opener.`
          : 'You are a world-class fashion stylist with expertise in personal styling, body types, and current trends. Create practical, stylish outfits tailored to each client.';

    // Build messages array with conversation history for context
    const conversationContext = eventDetails?.conversationHistory || conversationHistory || [];
    const hasConversationContext = conversationContext.length > 0;
    
    // If there's conversation history, modify the prompt to acknowledge it
    let contextualPrompt = prompt;
    if (hasConversationContext) {
      const historyText = conversationContext.map((msg: any) => 
        `${msg.role === 'user' ? 'User' : 'Stylist'}: ${msg.content}`
      ).join('\n');
      
      // Use original request to preserve full context (dress code, style, gender, etc.)
      const fullOriginalContext = originalRequest || conversationContext.find((m: any) => m.role === 'user')?.content || '';
      
      contextualPrompt = `${prompt}

ORIGINAL REQUEST (FULL CONTEXT - preserve all details like dress code, gender, style era, etc.):
${fullOriginalContext}

CONVERSATION HISTORY:
${historyText}

CURRENT USER MESSAGE (modification/clarification to the original request): ${occasion}

CRITICAL INSTRUCTION: The user is refining their original request. You MUST:
1. Keep ALL details from the original request (dress code, event type, style era, location, etc.)
2. Only change what the user specifically asks to modify in their current message
3. If they say "make it female" or "change to female", KEEP the same dress code/style but change the gender of recommendations
4. If they say "make it more casual", KEEP everything else but adjust formality
5. Do NOT start from scratch - this is a refinement, not a new request`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contextualPrompt }
    ];

    // Build payload based on model family (GPT-5 vs Gemini)
    const buildBody = (msgs: any[], useTool = true) => {
      const body: any = { model, messages: msgs };
      if (useTool) {
        body.tools = [outfitTool];
        body.tool_choice = { type: 'function', function: { name: 'provide_outfit_recommendation' } };
      }
      if (model.startsWith('openai/')) {
        // GPT-5 Mini uses reasoning tokens from the same budget, so allocate enough
        body.max_completion_tokens = 16000;
      } else {
        body.max_tokens = 3000;
        body.temperature = 0.7;
      }
      return body;
    };

    const callAI = async (msgs: any[], useTool = true) => {
      const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildBody(msgs, useTool)),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        console.error('Lovable AI error response:', errorText);
        if (resp.status === 429) throw new Error('Rate limit exceeded. Please try again in a moment.');
        if (resp.status === 402) throw new Error('AI service quota exceeded. Please contact support or add credits to your workspace.');
        throw new Error(`Lovable AI error: ${errorText}`);
      }

      return resp.json();
    };

    // Parse response from tool call
    const parseToolResponse = (raw: any) => {
      console.log('Raw AI response:', JSON.stringify(raw, null, 2));
      const message = raw.choices?.[0]?.message;
      
      if (!message) {
        console.error('No message in AI response');
        throw new Error('No message in AI response');
      }
      
      // Check for tool call response (OpenAI format)
      if (message?.tool_calls?.[0]?.function?.arguments) {
        console.log('Found tool_calls format');
        const args = message.tool_calls[0].function.arguments;
        return JSON.parse(typeof args === 'string' ? args : JSON.stringify(args));
      }
      
      // Check for function_call response (alternate format)
      if (message?.function_call?.arguments) {
        console.log('Found function_call format');
        const args = message.function_call.arguments;
        return JSON.parse(typeof args === 'string' ? args : JSON.stringify(args));
      }
      
      // Fallback to content parsing
      const content = message?.content?.trim?.() || '';
      console.log('Trying content parsing, content length:', content.length);
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        console.log('Found JSON in content');
        return JSON.parse(jsonMatch[0]);
      }
      
      console.error('No valid response format found in:', JSON.stringify(message, null, 2));
      throw new Error('No valid response from AI');
    };

    // First attempt with tool calling
    console.log('Calling AI with tool calling, model:', model, 'isHistorical:', isHistorical);
    const aiResponse = await callAI(messages);
    let recommendationData: any;

    try {
      recommendationData = parseToolResponse(aiResponse);
      console.log('Successfully parsed AI tool response');
    } catch (parseError) {
      console.error('Failed to parse AI tool response:', parseError);
      // Minimal fallback - but with proper period items for historical events
      if (isHistorical) {
        const era = occ.includes('1930') ? '1930s' : occ.includes('1920') ? '1920s' : '1940s';
        recommendationData = {
          recommended_items: {
            top: {
              name: era === '1930s' ? 'Silk bias-cut evening gown with Art Deco beading' : era === '1920s' ? 'Beaded drop-waist flapper dress with fringe details' : 'Structured crepe dress with padded shoulders',
              source: 'needs_rental',
              confidence: 0.9,
              reasoning: `Authentic ${era} silhouette that captures the glamour of the era. The ${era === '1930s' ? 'bias cut hugs curves elegantly' : era === '1920s' ? 'drop waist and fringe epitomize flapper style' : 'structured shoulders define 1940s fashion'}.`,
              styling_tips: `Pair with ${era === '1930s' ? 'a faux fur stole and long satin gloves' : era === '1920s' ? 'a feathered headband and long pearl necklace' : 'victory rolls hairstyle and red lipstick'}.`,
              purchase_options: {
                vintage_options: [{ source: 'Beyond Retro', price_range: '£60-150', url: 'https://www.beyondretro.com' }],
                rental_platforms: [{ platform: 'Angels Fancy Dress', price_range: '£40-80', url: 'https://www.fancydress.com' }]
              }
            },
            bottom: {
              name: 'N/A - Full-length gown (period authentic)',
              confidence: 0.95,
              reasoning: `${era} evening wear typically featured full-length gowns as complete outfits.`,
              styling_tips: 'Ensure hemline is appropriate for the era.'
            },
            shoes: {
              name: era === '1930s' ? 'Gold or silver T-strap heels' : era === '1920s' ? 'Low-heeled Mary Janes with decorative buckle' : 'Peep-toe platform pumps',
              source: 'needs_purchase',
              confidence: 0.88,
              reasoning: `Period-accurate footwear that complements ${era} fashion.`,
              styling_tips: 'Choose metallic or muted tones to match era aesthetics.',
              purchase_options: {
                vintage_options: [{ source: 'Rokit Vintage', price_range: '£30-60', url: 'https://www.rokit.co.uk' }]
              }
            },
            accessories: [
              { name: era === '1930s' ? 'Beaded clutch bag with Art Deco clasp' : era === '1920s' ? 'Long pearl rope necklace' : 'Structured leather clutch', confidence: 0.85, reasoning: 'Essential period accessory', styling_tips: 'Complete the vintage look' }
            ]
          },
          overall_confidence: 0.88,
          style_reasoning: `This ensemble captures authentic ${era} glamour with period-appropriate silhouettes, fabrics, and accessories. Each piece has been selected to create a cohesive, historically accurate look.`,
          styling_tips: [
            `Research ${era} makeup and hairstyles to complete the look`,
            'Consider period-appropriate jewelry like Art Deco pieces',
            'Check vintage shops and costume rental services for authentic items',
            'Practice walking in period shoes before the event'
          ],
          shopping_suggestions: {
            priority_items: ['Dress from costume rental', 'Period-appropriate shoes'],
            total_investment_needed: '£80-200 for rentals, £50-100 for purchased accessories'
          }
        };
      } else {
        recommendationData = {
          recommended_items: {
            top: { name: 'Tailored blazer in a neutral tone', confidence: 0.85, reasoning: 'Versatile layering piece', styling_tips: 'Roll sleeves for a relaxed look' },
            bottom: { name: 'High-waisted tailored trousers', confidence: 0.87, reasoning: 'Flattering and professional', styling_tips: 'Pair with tucked-in top' },
            shoes: { name: 'Leather ankle boots or loafers', confidence: 0.88, reasoning: 'Comfortable and stylish', styling_tips: 'Match leather tone to belt' }
          },
          overall_confidence: 0.85,
          style_reasoning: 'A polished, versatile outfit suitable for various occasions.',
          styling_tips: ['Focus on fit', 'Add personal touches with accessories']
        };
      }
    }

    // Simple server-side validator for historical events
    if (isHistorical && recommendationData?.recommended_items) {
      const banned = ['jeans', 'denim', 'sneaker', 'trainers', 'trainer', 't-shirt', 'tee', 'hoodie', 'sweatshirt', 'baseball cap', 'athleisure'];
      const items = recommendationData.recommended_items;
      const names: string[] = [];
      if (items.top?.name) names.push(String(items.top.name));
      if (items.bottom?.name) names.push(String(items.bottom.name));
      if (items.shoes?.name) names.push(String(items.shoes.name));
      if (Array.isArray(items.accessories)) {
        for (const acc of items.accessories) if (acc?.name) names.push(String(acc.name));
      }
      if (items.outerwear?.name) names.push(String(items.outerwear.name));

      const violations = names.filter((n) => banned.some((b) => n.toLowerCase().includes(b)));

      if (violations.length > 0) {
        // One retry with explicit correction
        const correction = `\nIMPORTANT: Your previous suggestion included modern items for a historical event: ${[...new Set(violations)].join(', ')}. Regenerate strictly period-accurate. DO NOT include jeans, denim, sneakers/trainers, t-shirts, hoodies, athleisure. Respond with JSON only.`;
        const retryResponse = await callAI([
          messages[0],
          { role: 'user', content: prompt + correction },
        ]);
        try {
          const retried = parseAiJson(retryResponse);
          recommendationData = retried;
        } catch (e) {
          console.warn('Retry parse failed, keeping validated fallback/result.');
          // As a last resort, scrub offending items from names
          const scrub = (s: string) => s.replace(/jeans|denim|sneaker|trainers?|t-shirt|tee|hoodie|sweatshirt|baseball cap|athleisure/gi, '');
          if (items.top?.name) items.top.name = scrub(items.top.name);
          if (items.bottom?.name) items.bottom.name = scrub(items.bottom.name);
          if (items.shoes?.name) items.shoes.name = scrub(items.shoes.name);
          if (Array.isArray(items.accessories)) {
            for (const acc of items.accessories) if (acc?.name) acc.name = scrub(acc.name);
          }
          if (items.outerwear?.name) items.outerwear.name = scrub(items.outerwear.name);
        }
      }
    }

    // ============================================
    // PRODUCT SEARCH: 4-Layer Strategy
    // Primary:     ShopStyle Collective API (best data, affiliate revenue)
    // Secondary:   SerpAPI Google Shopping (fills gaps ShopStyle misses)
    // Fallback:    Pre-built search URLs (guaranteed, zero cost)
    // Enhancement: Firecrawl for rental/secondhand platforms only
    // ============================================

    let shoppingMatches: any[] = [];
    const missingItems = recommendationData.missing_items_search || [];
    if (missingItems.length > 0) {
      console.log('Searching for', missingItems.length, 'missing items');

      const getPriceLimit = (tier: string) => {
        if (tier === 'budget') return 50;
        if (tier === 'mid_range') return 150;
        if (tier === 'luxury') return 9999;
        return styleProfile?.budget_max || 500;
      };

      // ── API keys ──
      const shopStyleApiKey = Deno.env.get('SHOPSTYLE_API_KEY');
      const serpApiKey = Deno.env.get('SERPAPI_API_KEY');
      const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

      // ── PRIMARY: ShopStyle Collective API ──
      const searchShopStyle = async (query: string, maxPrice: number): Promise<any[]> => {
        if (!shopStyleApiKey) return [];
        try {
          const encoded = encodeURIComponent(query);
          // ShopStyle API v2 — filter by price, UK locale
          const url = `https://api.shopstyle.com/api/v2/products?pid=${shopStyleApiKey}&fts=${encoded}&offset=0&limit=5&fl=p0:${maxPrice}&fl=d0:GB&fl=b0:GBP`;
          console.log(`[ShopStyle] Searching: "${query}" (max £${maxPrice})`);
          const response = await fetch(url);
          if (!response.ok) {
            console.warn('[ShopStyle] API error:', response.status);
            return [];
          }
          const data = await response.json();
          const products = (data.products || []).map((p: any) => ({
            retailer: p.retailer?.name || p.brand?.name || 'Retailer',
            product_name: p.name || p.brandedName || 'Product',
            price: p.priceLabel || (p.price ? `£${p.price}` : null),
            product_url: p.clickUrl || p.url || '',
            image_url: p.image?.sizes?.Best?.url || p.image?.sizes?.Large?.url || p.image?.sizes?.Medium?.url || null,
            source: 'shopstyle',
          }));
          console.log(`[ShopStyle] Found ${products.length} products for "${query}"`);
          return products;
        } catch (err) {
          console.warn('[ShopStyle] Error:', err);
          return [];
        }
      };

      // ── SECONDARY: SerpAPI Google Shopping ──
      const searchGoogleShopping = async (query: string, maxPrice: number): Promise<any[]> => {
        if (!serpApiKey) return [];
        try {
          const encoded = encodeURIComponent(query);
          const url = `https://serpapi.com/search.json?engine=google_shopping&q=${encoded}&gl=uk&hl=en&google_domain=google.co.uk&api_key=${serpApiKey}&num=5&tbs=mr:1,price:1,ppr_max:${maxPrice}`;
          console.log(`[SerpAPI] Searching Google Shopping: "${query}"`);
          const response = await fetch(url);
          if (!response.ok) {
            console.warn('[SerpAPI] API error:', response.status);
            return [];
          }
          const data = await response.json();
          const results = (data.shopping_results || []).slice(0, 5).map((r: any) => ({
            retailer: r.source || r.merchant?.name || 'Retailer',
            product_name: r.title || 'Product',
            price: r.extracted_price ? `£${r.extracted_price}` : (r.price || null),
            product_url: r.link || r.product_link || '',
            image_url: r.thumbnail || null,
            source: 'google_shopping',
          }));
          console.log(`[SerpAPI] Found ${results.length} products for "${query}"`);
          return results;
        } catch (err) {
          console.warn('[SerpAPI] Error:', err);
          return [];
        }
      };

      // ── FALLBACK: Pre-built search URLs (guaranteed, zero cost) ──
      const buildSearchUrls = (query: string, tier: string): any[] => {
        const encoded = encodeURIComponent(query);
        const retailersByTierUrls: Record<string, { name: string; url: string }[]> = {
          budget: [
            { name: 'ASOS', url: `https://www.asos.com/search/?q=${encoded}` },
            { name: 'H&M', url: `https://www2.hm.com/en_gb/search-results.html?q=${encoded}` },
            { name: 'Zara', url: `https://www.zara.com/uk/en/search?searchTerm=${encoded}` },
          ],
          mid_range: [
            { name: '& Other Stories', url: `https://www.stories.com/en_gbp/search.html?q=${encoded}` },
            { name: 'Reiss', url: `https://www.reiss.com/uk/search?q=${encoded}` },
            { name: 'Mango', url: `https://shop.mango.com/gb/search?kw=${encoded}` },
            { name: 'COS', url: `https://www.cos.com/en_gbp/search.html?q=${encoded}` },
          ],
          luxury: [
            { name: 'Net-a-Porter', url: `https://www.net-a-porter.com/en-gb/shop/search/${encoded}` },
            { name: 'Selfridges', url: `https://www.selfridges.com/GB/en/cat/?freeText=${encoded}` },
            { name: 'Matches Fashion', url: `https://www.matchesfashion.com/search?q=${encoded}` },
          ],
        };
        const retailers = retailersByTierUrls[tier] || retailersByTierUrls.mid_range;
        return retailers.map(r => ({
          retailer: r.name,
          product_name: `Search ${r.name} for "${query}"`,
          price: null,
          product_url: r.url,
          image_url: null,
          source: 'search_url',
        }));
      };

      const buildRentalSearchUrls = (query: string): any[] => {
        const encoded = encodeURIComponent(query);
        return [
          { platform: 'HURR', product_name: `Rent on HURR: "${query}"`, price: null, product_url: `https://www.hurr.com/search?q=${encoded}`, image_url: null, type: 'rental', source: 'search_url' },
          { platform: 'By Rotation', product_name: `Rent on By Rotation: "${query}"`, price: null, product_url: `https://www.byrotation.com/search?q=${encoded}`, image_url: null, type: 'rental', source: 'search_url' },
        ];
      };

      const buildSecondhandSearchUrls = (query: string): any[] => {
        const encoded = encodeURIComponent(query);
        return [
          { platform: 'Vestiaire Collective', product_name: `Shop pre-owned: "${query}"`, price: null, product_url: `https://www.vestiairecollective.com/search/?q=${encoded}`, image_url: null, condition: null, type: 'secondhand', source: 'search_url' },
          { platform: 'Vinted', product_name: `Find on Vinted: "${query}"`, price: null, product_url: `https://www.vinted.co.uk/catalog?search_text=${encoded}`, image_url: null, condition: null, type: 'secondhand', source: 'search_url' },
          { platform: 'Depop', product_name: `Find on Depop: "${query}"`, price: null, product_url: `https://www.depop.com/search/?q=${encoded}`, image_url: null, condition: null, type: 'secondhand', source: 'search_url' },
        ];
      };

      // ── ENHANCEMENT: Firecrawl for rental & secondhand platforms only ──
      const searchFirecrawlPlatform = async (query: string, platform: { name: string; domain: string }, type: 'rental' | 'secondhand'): Promise<any> => {
        if (!firecrawlApiKey) return null;
        try {
          const response = await fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: `${query} site:${platform.domain}`,
              limit: 1,
              scrapeOptions: { formats: ['markdown'] },
            }),
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
            return {
              platform: platform.name,
              product_name: result.title || result.metadata?.title || 'Unknown product',
              price: rentalPriceMatch ? rentalPriceMatch[0] : null,
              product_url: result.url || '',
              image_url: imageUrl,
              type: 'rental',
              source: 'firecrawl',
            };
          } else {
            const priceMatch = markdown.match(/£[\d,]+(?:\.\d{2})?/);
            const conditionMatch = markdown.match(/(?:condition|quality)[:\s]*(excellent|very good|good|fair|new with tags|like new|pristine)/i);
            const condition = conditionMatch ? conditionMatch[1] :
              markdown.match(/\b(excellent|pristine|like new|new with tags)\b/i) ? 'excellent' :
              markdown.match(/\b(very good|great condition)\b/i) ? 'good' : null;
            return {
              platform: platform.name,
              product_name: result.title || result.metadata?.title || 'Unknown product',
              price: priceMatch ? priceMatch[0] : null,
              product_url: result.url || '',
              image_url: imageUrl,
              condition: condition || 'good',
              type: 'secondhand',
              source: 'firecrawl',
            };
          }
        } catch (err) {
          return null;
        }
      };

      // ── Run all searches per missing item ──
      const searchPromises = missingItems.map(async (item: any) => {
        const keywords = item.search_keywords || [];
        const category = item.category || '';
        const maxPrice = getPriceLimit(item.price_tier);
        const searchQuery = `${item.item_type} ${item.style_descriptor || ''}`.trim();
        const tier = item.price_tier || 'mid_range';

        // Internal DB search (always runs)
        const keywordFilters = keywords
          .map((kw: string) => `name.ilike.%${kw}%,description.ilike.%${kw}%,brand.ilike.%${kw}%`)
          .join(',');

        let dbQuery = supabase
          .from('shopping_items')
          .select('id, name, brand, category, price, rental_price, image_url, retailer_name, retailer_url, colors, sizes, description')
          .eq('in_stock', true)
          .lte('price', maxPrice);

        if (category) dbQuery = dbQuery.ilike('category', `%${category}%`);
        if (keywordFilters) dbQuery = dbQuery.or(keywordFilters);

        const { data: matches } = await dbQuery.order('price', { ascending: true }).limit(3);

        // ── RETAILER RESULTS: ShopStyle → SerpAPI → Search URLs ──
        // Step 1: Try ShopStyle (primary)
        let retailer_results = await searchShopStyle(searchQuery, maxPrice);

        // Step 2: If ShopStyle returned <2 results, fill gaps with SerpAPI
        if (retailer_results.length < 2) {
          const serpResults = await searchGoogleShopping(searchQuery, maxPrice);
          retailer_results = [...retailer_results, ...serpResults];
          if (serpResults.length > 0) {
            console.log(`[SerpAPI] Filled ${serpResults.length} gaps for "${searchQuery}"`);
          }
        }

        // Step 3: If still no results, use guaranteed search URLs
        if (retailer_results.length === 0) {
          retailer_results = buildSearchUrls(searchQuery, tier);
          console.log(`[Fallback] Using search URLs for "${searchQuery}"`);
        }

        retailer_results = retailer_results.slice(0, 6);

        // ── RENTAL RESULTS: Firecrawl (rental platforms aren't on ShopStyle/Google) → fallback URLs ──
        const rentalPlatforms = [
          { name: 'HURR', domain: 'hurr.co.uk' },
          { name: 'By Rotation', domain: 'byrotation.com' },
          { name: 'My Wardrobe HQ', domain: 'mywardrobehq.com' },
          { name: 'On Loan', domain: 'onloan.co.uk' },
        ];
        const rentalFirecrawlResults = (await Promise.all(
          rentalPlatforms.map(p => searchFirecrawlPlatform(searchQuery, p, 'rental'))
        )).filter(Boolean);
        let rental_results = rentalFirecrawlResults.length > 0
          ? rentalFirecrawlResults.slice(0, 3)
          : buildRentalSearchUrls(searchQuery);

        // ── SECONDHAND RESULTS: Firecrawl → fallback URLs ──
        const secondhandPlatforms = [
          { name: 'Vestiaire Collective', domain: 'vestiairecollective.com' },
          { name: 'Depop', domain: 'depop.com' },
          { name: 'Vinted', domain: 'vinted.co.uk' },
          { name: 'The RealReal', domain: 'therealreal.com' },
        ];
        const secondhandFirecrawlResults = (await Promise.all(
          secondhandPlatforms.map(p => searchFirecrawlPlatform(searchQuery, p, 'secondhand'))
        )).filter(Boolean);
        let secondhand_results = secondhandFirecrawlResults.length > 0
          ? secondhandFirecrawlResults.slice(0, 3)
          : buildSecondhandSearchUrls(searchQuery);

        console.log(`[Result] "${searchQuery}": ${retailer_results.length} retailer (sources: ${[...new Set(retailer_results.map((r: any) => r.source))].join(',')}), ${rental_results.length} rental, ${secondhand_results.length} secondhand`);

        return {
          item_type: item.item_type,
          style_descriptor: item.style_descriptor,
          occasion_suitability: item.occasion_suitability,
          price_tier: item.price_tier,
          category: item.category,
          db_matches: matches || [],
          retailer_results,
          rental_results,
          secondhand_results,
        };
      });

      shoppingMatches = await Promise.all(searchPromises);
      console.log('[Search Complete]', shoppingMatches.map(m => `${m.item_type}: ${m.retailer_results?.length || 0} retailer`).join(', '));
    }

    // Save recommendation to database only if user is authenticated
    let savedRecommendation = null;
    if (user) {
      const { data: dbRecommendation, error: saveError } = await supabase
        .from('ai_recommendations')
        .insert({
          user_id: user.id,
          recommendation_type: recommendationType,
          recommended_items: recommendationData.recommended_items,
          occasion,
          weather_context: weatherData,
          confidence_score: recommendationData.overall_confidence,
          reasoning: recommendationData.style_reasoning,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single();

      if (saveError) {
        console.error('Error saving recommendation:', saveError);
        // Don't throw error, just log it and continue without saving
      } else {
        savedRecommendation = dbRecommendation;
      }
    }

    // Create recommendation response (with or without database record)
    const recommendationResponse = savedRecommendation || {
      id: 'anonymous-' + Date.now(),
      recommendation_type: recommendationType,
      recommended_items: recommendationData.recommended_items,
      occasion,
      weather_context: weatherData,
      confidence_score: recommendationData.overall_confidence,
      reasoning: recommendationData.style_reasoning,
      created_at: new Date().toISOString()
    };

    return new Response(JSON.stringify({
      recommendation: recommendationResponse,
      ai_insights: {
        styling_tips: recommendationData.styling_tips,
        alternative_options: recommendationData.alternative_options,
        color_analysis: recommendationData.color_analysis,
        fit_guidance: recommendationData.fit_guidance,
        shopping_suggestions: recommendationData.shopping_suggestions,
        wardrobe_analysis: recommendationData.wardrobe_analysis
      },
      missing_items: shoppingMatches,
      wardrobe_status: {
        is_authenticated: !!user,
        wardrobe_count: wardrobeItems?.length || 0,
        has_wardrobe: (wardrobeItems?.length || 0) > 0,
      },
      cultural_context: culturalNorms.length > 0 ? {
        country: detectedCountry,
        norms: culturalNorms.map(n => ({
          context_type: n.context_type,
          guidance: n.guidance.slice(0, 300),
        })),
      } : null,
      rate_limit_info: rateLimitResult ? {
        remaining_requests: rateLimitResult.remaining_requests,
        rate_limit: rateLimitResult.rate_limit,
        subscription_tier: rateLimitResult.subscription_tier,
        reset_time: rateLimitResult.reset_time
      } : null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-ai-recommendations function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
