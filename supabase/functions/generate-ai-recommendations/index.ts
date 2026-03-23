
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
      // Accumulated conversation context
      accumulated_context = null,
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
        .limit(50);
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
    for (const [city, country] of Object.entries(cityToCountry)) {
      if (countryDetectionText.toLowerCase().includes(city.toLowerCase())) {
        detectedCountry = country;
        break;
      }
    }
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

    // ============================================
    // CONVERSATIONAL CONTEXT — build accumulated knowledge
    // ============================================
    const ctx = accumulated_context || {};
    const exchangeCount = ctx.exchange_count || 0;
    const knownLocation = ctx.location || (styleProfile?.home_city ? styleProfile.home_city : null);
    const knownVenue = ctx.venue_type || (venueContext?.venue_name ? venueContext.venue_name : null);
    const knownEmotionalGoal = ctx.emotional_goal || emotional_tone_label || emotional_tone || null;
    const knownCompany = ctx.who_with || null;
    const knownBudget = ctx.budget || null;
    const knownDressCode = ctx.dress_code || (venueContext?.dress_code && venueContext.dress_code !== 'none_specified' ? venueContext.dress_code : null) || (eventContext?.dress_code && eventContext.dress_code !== 'none_specified' ? eventContext.dress_code : null);
    const knownDate = ctx.date || null;
    const userPreferences = ctx.style_preferences || [];
    const likedItems = ctx.liked_items || [];
    const rejectedItems = ctx.rejected_items || [];

    // Determine what's still missing and pick the ONE most important follow-up question
    let followUpQuestion: string | null = null;
    if (exchangeCount < 3) {
      const userMsg = (user_message || occasion || '').toLowerCase();
      
      // Priority 1: Location/venue/dress code
      if (!knownLocation && !knownVenue && !knownDressCode && !venueContext && !eventContext) {
        // Check if the user already mentioned a location in this message
        const mentionsLocation = Object.keys(cityToCountry).some(city => userMsg.includes(city.toLowerCase()));
        if (!mentionsLocation) {
          followUpQuestion = "Where are you headed? Any idea what kind of place — or is there a dress code?";
        }
      }
      // Priority 2: Date (for weather)
      else if (!knownDate && !weatherData?.forecastDate) {
        const mentionsDate = /\b(today|tonight|tomorrow|this weekend|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}(?:st|nd|rd|th))\b/i.test(userMsg);
        if (!mentionsDate && knownLocation) {
          followUpQuestion = "When is it — so I can check the forecast for you?";
        }
      }
      // Priority 3: Budget (only when shopping)
      else if (!knownBudget) {
        const mentionsBudget = /budget|£|£?\d+|\$|under|spend|afford|price/i.test(userMsg);
        if (!mentionsBudget) {
          // Only ask about budget when we have enough other context
          if (knownLocation && (knownVenue || knownDressCode)) {
            followUpQuestion = "Do you have a budget in mind?";
          }
        }
      }
      // Priority 4: Who they're with
      else if (!knownCompany) {
        const mentionsCompany = /\b(date|romantic|partner|boyfriend|girlfriend|husband|wife|friends?|mates?|girls?|guys?|lads?|colleagues?|boss|client|family|parents?|mum|dad|solo|alone)\b/i.test(userMsg);
        if (!mentionsCompany) {
          followUpQuestion = "Is this a date night, friends thing, or something else?";
        }
      }
      // Priority 5: Emotional goal (last resort)
      else if (!knownEmotionalGoal) {
        const mentionsTone = /\b(romantic|sexy|confident|powerful|bold|cool|edgy|relaxed|casual|fun|playful|elegant|chic|warm|friendly|professional|polished)\b/i.test(userMsg);
        if (!mentionsTone) {
          followUpQuestion = "How do you want to feel — romantic, confident, bold, relaxed, something else?";
        }
      }
    }

    // If we've had 3+ exchanges or everything is known, use a soft invitation
    if (exchangeCount >= 3 && !followUpQuestion) {
      followUpQuestion = null; // No more questions, just respond
    }

    // Build assumption line for when info is missing
    const assumptions: string[] = [];
    if (!knownLocation && !venueContext && !eventContext) {
      const city = styleProfile?.home_city || 'a neutral international setting';
      assumptions.push(city);
    }
    if (!knownVenue && !venueContext && !eventContext && !knownDressCode) {
      // Infer from occasion
      const occ = (occasion || '').toLowerCase();
      if (occ.includes('dinner') || occ.includes('restaurant')) assumptions.push('restaurant dinner');
      else if (occ.includes('party') || occ.includes('night out')) assumptions.push('night out');
      else if (occ.includes('brunch')) assumptions.push('daytime brunch');
      else if (occ.includes('wedding')) assumptions.push('wedding');
      else if (occ.includes('work') || occ.includes('office') || occ.includes('interview')) assumptions.push('professional setting');
      else if (occ.includes('date')) assumptions.push('date night');
    }
    if (!knownEmotionalGoal && !emotional_tone) {
      const occ = (occasion || '').toLowerCase();
      if (occ.includes('date') || occ.includes('romantic')) assumptions.push('romantic vibe');
      else if (occ.includes('work') || occ.includes('interview') || occ.includes('meeting')) assumptions.push('polished and professional');
      else if (occ.includes('friend') || occ.includes('brunch') || occ.includes('casual')) assumptions.push('relaxed and put-together');
      else if (occ.includes('party') || occ.includes('night out') || occ.includes('club')) assumptions.push('bold and confident');
    }

    const assumptionLine = assumptions.length > 0 
      ? `Assuming ${assumptions.join(', ')} — here's what I'd suggest:\n\n`
      : '';

// Enhanced AI prompt with more context
    const prompt = `You are an expert fashion stylist called Oracle. You are conversational, warm, and opinionated — like a stylish best friend.

CORE BEHAVIOUR:
- ALWAYS give a recommendation immediately, no matter how little information you have.
- Make smart assumptions when information is missing. State assumptions briefly in ONE line before the recommendation.
- NEVER refuse to recommend or say you need more information.
- After your recommendation, ask EXACTLY ONE follow-up question — the single most important missing piece of context.
- If you have all the context you need, end with "Does this feel right, or want me to adjust anything?" instead of a question.
- NEVER ask more than one question per response.
- NEVER ask about something the user already stated.
- Questions should sound natural and friendly, like a friend talking — never like a form field.
- Maximum 3 follow-up exchanges, then stop asking and just respond.

${followUpQuestion ? `
FOLLOW-UP QUESTION TO ASK (ask this at the END of your response, after the recommendation):
"${followUpQuestion}"
` : exchangeCount < 3 ? `
All key context is known. End your response with: "Does this feel right, or want me to adjust anything?"
` : `
You've already had ${exchangeCount} exchanges. Do NOT ask any more questions. Just give the recommendation and invite refinement naturally.
`}

${assumptions.length > 0 ? `
ASSUMPTIONS TO STATE (put this in ONE brief line before your recommendation):
${assumptions.join(', ')}
` : ''}

${accumulated_context ? `
ACCUMULATED CONVERSATION CONTEXT (what Oracle already knows from this conversation):
- Location: ${ctx.location || 'not yet known'}
- Venue: ${ctx.venue_type || 'not yet specified'}
- Dress code: ${ctx.dress_code || 'not yet specified'}
- Emotional goal: ${ctx.emotional_goal || 'not yet specified'}
- Who with: ${ctx.who_with || 'not yet specified'}
- Budget: ${ctx.budget || 'not yet specified'}
- Date/time: ${ctx.date || 'not yet specified'}
- Style preferences mentioned: ${(ctx.style_preferences || []).join(', ') || 'none yet'}
- Items they liked: ${(ctx.liked_items || []).join(', ') || 'none yet'}
- Items they rejected: ${(ctx.rejected_items || []).join(', ') || 'none yet'}
- Exchange count: ${exchangeCount}

IMPORTANT: Acknowledge new information naturally in one short sentence before giving your updated recommendation. Do NOT repeat context the user already knows.
` : ''}

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
- Lighting: candlelit dinner? outdoor golden hour? neon-lit bar? gallery spotlights?
- Visual backdrop: beach, city skyline, rustic interior, modern minimalist space
- Colour palette of the setting: recommend colours that will photograph well
- Whether the setting is photography-heavy

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIORITY 3 — EMOTIONAL GOAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Within the above constraints, reason about how the user wants to FEEL:
- Date night → romantic, attractive, effortless
- Girls night out → fun, confident, memorable
- Work/networking → authoritative, polished
- Family occasion → appropriate but still stylish
The emotional goal may be provided as a user selection. If no selection was made, infer it from the occasion and proceed — do NOT ask again.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIORITY 4 — PHYSICAL CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Practical considerations applied last:
- Standing all night vs seated dinner
- Dancing vs dining
- Indoor to outdoor transitions
- Weather and temperature
- Comfort for duration of event

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Lead the recommendation with ONE sentence that references the specific setting and emotional goal — NEVER a generic opener like "Here's what I'd suggest" or "For this occasion".
Then give the outfit recommendation.
Then add any dress code or practical notes as a brief footnote — NOT the headline.
End with exactly ONE follow-up question (or the refinement invitation if all context is known).


USER STYLE PROFILE:
- Name: ${styleProfile?.display_name || 'Not specified'}
- Based in: ${styleProfile?.home_city || 'Not specified'}
- Body Type: ${styleProfile?.body_type || 'Not specified'}
- Fit Preference: ${styleProfile?.fit_preference || 'Not specified'}
- Preferred Colors: ${styleProfile?.preferred_colors?.join(', ') || 'None specified'}
- Disliked Colors: ${styleProfile?.disliked_colors?.join(', ') || 'None specified'}
- Style Personality: ${styleProfile?.style_personality?.join(', ') || 'None specified'}
- Preferred Patterns: ${styleProfile?.preferred_patterns?.join(', ') || 'None specified'}
- Preferred Fabrics: ${styleProfile?.preferred_fabrics?.join(', ') || 'None specified'}
- Preferred Brands: ${styleProfile?.preferred_brands?.join(', ') || 'None specified'}
- Items to Avoid: ${styleProfile?.items_to_avoid?.join(', ') || 'None specified'}
- Shopping Preference: ${styleProfile?.shopping_preference || 'Not specified'}
- Budget: ${styleProfile?.default_budget ? (styleProfile?.budget_currency || '£') + styleProfile.default_budget : 'Not specified'}
- Budget Range: $${styleProfile?.budget_min || 0} - $${styleProfile?.budget_max || 1000}
- Style Confidence: ${styleProfile?.style_confidence_score ? Math.round(styleProfile.style_confidence_score * 100) + '%' : 'Not specified'}
- Height: ${styleProfile?.height_cm ? styleProfile.height_cm + 'cm' : 'Not specified'}
- Size Preferences: Top ${styleProfile?.standard_size_top || 'N/A'}, Bottom ${styleProfile?.standard_size_bottom || 'N/A'}, Shoes ${styleProfile?.standard_size_shoes || 'N/A'}

LEARNED PREFERENCES FROM FEEDBACK:
${userInsights?.length > 0 ? userInsights.map(insight => 
  `- ${insight.insight_type}: ${insight.insight_value || 'N/A'} (confidence: ${Math.round((insight.confidence_score || 0.5) * 100)}%)`
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
${weatherData ? `Temperature: ${weatherData.temperature}°C, Condition: ${weatherData.condition}, Humidity: ${weatherData.humidity}%, Location: ${weatherData.location}` : 'Weather not specified'}

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

CRITICAL: This event information was scraped from the actual event's website. You MUST tailor the outfit recommendation to match this event's specific dress code, setting (indoor/outdoor), and time of day.
` : eventContext?.source === 'name_only' ? `
🎫 EVENT MENTIONED: "${eventContext.event_name}"${eventContext.event_type ? ` (${eventContext.event_type})` : ''}

We could not scrape the event's website for details. Use your own knowledge of this event to infer the likely dress code, setting (indoor/outdoor), time of day, and formality level.
` : ''}

${(eventContext && venueContext) ? `
⚖️ DRESS CODE PRIORITY (when both event and venue context exist):
1. Explicit dress code from the scraped EVENT page (highest priority)
2. Venue formality and atmosphere from the scraped VENUE page
3. Event type inferred from the user's message
4. Your general knowledge (fallback)
If the event dress code conflicts with the venue dress code, follow the EVENT dress code.
` : ''}

${culturalNorms.length > 0 ? `
🌍 CULTURAL DRESS NORMS FOR ${detectedCountry?.toUpperCase()} (from travel research - FOLLOW THESE):
${culturalNorms.map(n => `**${n.context_type.replace(/_/g, ' ').toUpperCase()}:** ${n.guidance.slice(0, 500)}`).join('\n\n')}

CRITICAL: These are real cultural dress expectations for ${detectedCountry}. Your outfit recommendation MUST respect these norms.
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

ONLY SUGGEST:
- Authentic period garments (bias-cut gowns for 1930s, drop-waist for 1920s, etc.)
- Period-appropriate shoes (T-strap heels, Mary Janes, Oxford pumps from that era)
- Historically accurate accessories (period hats, gloves, beaded bags, fur stoles)
- Vintage or reproduction pieces that are true to the era
` : ''}

STYLING BRIEF:
${recommendationType === 'event_outfit' ? 
  `Create an outfit specifically tailored for this event. ${(occasion?.toLowerCase().includes('1930') || occasion?.toLowerCase().includes('1920') || occasion?.toLowerCase().includes('1940') || eventDetails?.description?.toLowerCase().includes('1930') || eventDetails?.description?.toLowerCase().includes('1920')) ? '⚠️ CRITICAL HISTORICAL ACCURACY REQUIRED ⚠️' : ''} ${eventDetails?.description || occasion || ''}` :
  'Create a versatile daily outfit that reflects the user\'s personal style while being practical for their lifestyle.'
}

HISTORICAL ACCURACY REQUIREMENTS (when applicable):
If the occasion mentions "1930s", "1920s", "1940s" or any historical period:
- 1930s: bias-cut silk gowns, midi-to-floor length, Art Deco beading, T-strap heels
- 1920s: drop-waist dresses, knee-length, fringe, beading, feather headbands, Mary Jane heels
- 1940s: structured shoulders, A-line skirts, victory rolls, utility fashion, peep-toe pumps

CRITICAL: Use the learned preferences and recent feedback to improve this recommendation.

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
      "reasoning": "detailed explanation",
      "styling_tips": "how to wear this piece effectively",
      "alternatives": ["alternative option 1", "alternative option 2"],
      "purchase_options": {
        "uk_retailers": [{ "store": "Store name", "price_range": "£50-100", "url": "https://..." }],
        "rental_platforms": [{ "platform": "Platform name", "price_range": "£20-40 rental", "url": "https://..." }],
        "vintage_options": [{ "source": "Vintage store", "price_range": "£30-80", "url": "https://..." }]
      }
    },
    "bottom": { "name": "...", "source": "...", "confidence": 0.85, "reasoning": "...", "styling_tips": "...", "purchase_options": {} },
    "shoes": { "name": "...", "source": "...", "confidence": 0.8, "reasoning": "...", "styling_tips": "...", "purchase_options": {} },
    "accessories": [{ "name": "...", "confidence": 0.7, "reasoning": "...", "styling_tips": "..." }],
    "outerwear": { "name": "...", "confidence": 0.75, "reasoning": "...", "styling_tips": "..." }
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
  "style_reasoning": "Open with ONE sentence referencing the specific setting and emotional goal. Then describe how the outfit will look. End with exactly ONE follow-up question or refinement invitation.",
  "color_analysis": "...",
  "fit_guidance": "...",
  "styling_tips": ["tip 1", "tip 2", "tip 3"],
  "alternative_options": {
    "if_cooler": "...", "if_warmer": "...", "dressy_version": "...", "casual_version": "...",
    "budget_friendly": "...", "investment_pieces": "..."
  },
  "shopping_suggestions": {
    "priority_items": ["item 1", "item 2"],
    "total_investment_needed": "£X-Y",
    "wardrobe_utilization": "X%",
    "recommended_approach": "..."
  }
}

Focus on creating a cohesive, stylish outfit. 

CRITICAL FINAL INSTRUCTIONS:
1. WARDROBE FIRST: Always check if the user has suitable items in their wardrobe before suggesting purchases
2. SMART MIXING: Create outfits that combine existing wardrobe items with strategic new purchases or rentals
3. REAL LINKS: Provide actual URLs to UK retailers, rental platforms, and vintage shops
4. VALUE OPTIMIZATION: Help users maximize their existing wardrobe
5. For period/themed events: Provide specific links to costume rental shops and vintage stores
6. Price transparency: Always include price ranges in GBP (£)
7. MISSING ITEMS: For every item with source "needs_purchase" or "needs_rental", include a corresponding entry in "missing_items_search"

Remember: The goal is to create perfect, achievable outfits using what the user owns + targeted shopping/rental recommendations with real, clickable links.`;

    // Dynamic model selection and stricter validation for historical/themed events
    const occ = (occasion || '').toLowerCase();
    const desc = (eventDetails?.description || '').toLowerCase();
    const isHistorical = /(1920|1930|1940|victorian|edwardian|regency|vintage|period)/.test(`${occ} ${desc}`);
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
                    name: { type: 'string', description: 'Specific item name' },
                    source: { type: 'string', enum: ['from_wardrobe', 'needs_purchase', 'needs_rental'] },
                    confidence: { type: 'number' },
                    reasoning: { type: 'string' },
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
            overall_confidence: { type: 'number' },
            style_reasoning: { type: 'string', description: 'Comprehensive explanation ending with exactly ONE follow-up question or refinement invitation' },
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
              items: {
                type: 'object',
                properties: {
                  item_type: { type: 'string' },
                  style_descriptor: { type: 'string' },
                  occasion_suitability: { type: 'string' },
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
      ? `You are Oracle, an expert fashion historian and costume consultant. For this historical event, you MUST only recommend authentic period pieces. NEVER suggest modern items like jeans or sneakers. Always give a recommendation immediately — never refuse or ask for more info first. End with exactly ONE follow-up question.`
      : emotional_tone
        ? `You are Oracle, a world-class fashion stylist. The user wants to feel "${emotional_tone_label || emotional_tone}". Every piece you recommend should serve this emotional goal. Lead with the feeling. Be conversational and warm. Always give a recommendation immediately. End with exactly ONE follow-up question if important context is missing, or a refinement invitation if not.`
        : inferred_venue_formality
          ? `You are Oracle, a world-class fashion stylist. The user described a vague venue or occasion. NEVER ask for more details before recommending — make smart assumptions and state them briefly. Use the context clues provided to make a confident recommendation. Be conversational and warm. End with exactly ONE follow-up question.`
          : `You are Oracle, a world-class fashion stylist. Be conversational and warm — like a stylish best friend. ALWAYS give a recommendation immediately based on whatever the user said, even if information is missing. Make smart assumptions and state them briefly. End with exactly ONE follow-up question if important context is missing, or a refinement invitation if not. NEVER ask more than one question. NEVER refuse to recommend.`;

    // Build messages array with conversation history for context
    const conversationContext = eventDetails?.conversationHistory || conversationHistory || [];
    const hasConversationContext = conversationContext.length > 0;
    
    let contextualPrompt = prompt;
    if (hasConversationContext) {
      const historyText = conversationContext.map((msg: any) => 
        `${msg.role === 'user' ? 'User' : 'Oracle'}: ${msg.content}`
      ).join('\n');
      
      const fullOriginalContext = originalRequest || conversationContext.find((m: any) => m.role === 'user')?.content || '';
      
      contextualPrompt = `${prompt}

ORIGINAL REQUEST (FULL CONTEXT): ${fullOriginalContext}

CONVERSATION HISTORY:
${historyText}

CURRENT USER MESSAGE: ${occasion}

CRITICAL: The user is refining their original request. Keep ALL details from the original request. Only change what the user specifically asks to modify. Do NOT start from scratch.`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contextualPrompt }
    ];

    const buildBody = (msgs: any[], useTool = true) => {
      const body: any = { model, messages: msgs };
      if (useTool) {
        body.tools = [outfitTool];
        body.tool_choice = { type: 'function', function: { name: 'provide_outfit_recommendation' } };
      }
      if (model.startsWith('openai/')) {
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

    const parseToolResponse = (raw: any) => {
      console.log('Raw AI response:', JSON.stringify(raw, null, 2));
      const message = raw.choices?.[0]?.message;
      
      if (!message) {
        console.error('No message in AI response');
        throw new Error('No message in AI response');
      }
      
      if (message?.tool_calls?.[0]?.function?.arguments) {
        console.log('Found tool_calls format');
        const args = message.tool_calls[0].function.arguments;
        return JSON.parse(typeof args === 'string' ? args : JSON.stringify(args));
      }
      
      if (message?.function_call?.arguments) {
        console.log('Found function_call format');
        const args = message.function_call.arguments;
        return JSON.parse(typeof args === 'string' ? args : JSON.stringify(args));
      }
      
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

    console.log('Calling AI with tool calling, model:', model, 'isHistorical:', isHistorical);
    const aiResponse = await callAI(messages);
    let recommendationData: any;

    try {
      recommendationData = parseToolResponse(aiResponse);
      console.log('Successfully parsed AI tool response');
    } catch (parseError) {
      console.error('Failed to parse AI tool response:', parseError);
      if (isHistorical) {
        const era = occ.includes('1930') ? '1930s' : occ.includes('1920') ? '1920s' : '1940s';
        recommendationData = {
          recommended_items: {
            top: {
              name: era === '1930s' ? 'Silk bias-cut evening gown with Art Deco beading' : era === '1920s' ? 'Beaded drop-waist flapper dress with fringe details' : 'Structured crepe dress with padded shoulders',
              source: 'needs_rental',
              confidence: 0.9,
              reasoning: `Authentic ${era} silhouette.`,
              styling_tips: `Pair with period-appropriate accessories.`,
              purchase_options: {
                vintage_options: [{ source: 'Beyond Retro', price_range: '£60-150', url: 'https://www.beyondretro.com' }],
                rental_platforms: [{ platform: 'Angels Fancy Dress', price_range: '£40-80', url: 'https://www.fancydress.com' }]
              }
            },
            bottom: { name: 'N/A - Full-length gown (period authentic)', confidence: 0.95, reasoning: `${era} evening wear featured full-length gowns.`, styling_tips: 'Ensure hemline is era-appropriate.' },
            shoes: { name: era === '1930s' ? 'Gold or silver T-strap heels' : era === '1920s' ? 'Low-heeled Mary Janes' : 'Peep-toe platform pumps', source: 'needs_purchase', confidence: 0.88, reasoning: 'Period-accurate footwear.', styling_tips: 'Choose metallic or muted tones.' },
            accessories: [{ name: era === '1930s' ? 'Beaded clutch bag with Art Deco clasp' : era === '1920s' ? 'Long pearl rope necklace' : 'Structured leather clutch', confidence: 0.85, reasoning: 'Essential period accessory', styling_tips: 'Complete the vintage look' }]
          },
          overall_confidence: 0.88,
          style_reasoning: `This ensemble captures authentic ${era} glamour with period-appropriate silhouettes.`,
          styling_tips: ['Research period makeup and hairstyles', 'Consider period-appropriate jewelry', 'Check vintage shops for authentic items'],
          shopping_suggestions: { priority_items: ['Dress from costume rental', 'Period-appropriate shoes'], total_investment_needed: '£80-200' }
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
    // WARDROBE STATE DETECTION
    // ============================================
    const EXPLICIT_SHOP_PATTERNS = [
      /\b(find|show|get)\s+(me\s+)?(something|options?)\s+(to\s+)?(buy|purchase|shop)/i,
      /\bwhere\s+can\s+i\s+(get|buy|find|purchase)/i,
      /\bi\s+want\s+something\s+new/i,
      /\bshop\s+(this|the)\s+look/i,
      /\bbuy\s+(this|the|a|an|some)/i,
      /\bshopping\s+(options|suggestions|links)/i,
      /\bshow\s+me\s+(products|items|things)\s+to\s+buy/i,
    ];
    const userMessageText = user_message || occasion || '';
    const isExplicitShop = EXPLICIT_SHOP_PATTERNS.some(p => p.test(userMessageText));

    const ACCESSORY_KEYWORDS = ['earring', 'necklace', 'bracelet', 'ring', 'watch', 'bag', 'clutch', 'belt', 'scarf', 'hat', 'sunglasses', 'jewellery', 'jewelry', 'cufflinks', 'tie', 'brooch'];
    const isAccessoryItem = (name: string) => {
      const lower = (name || '').toLowerCase();
      return ACCESSORY_KEYWORDS.some(kw => lower.includes(kw));
    };

    type WardrobeState = 'no_wardrobe' | 'partial' | 'full_match' | 'explicit_shop';
    let wardrobeState: WardrobeState;

    if (isExplicitShop) {
      wardrobeState = 'explicit_shop';
    } else if (!user || !wardrobeItems || wardrobeItems.length === 0) {
      wardrobeState = 'no_wardrobe';
    } else {
      const items = recommendationData.recommended_items || {};
      const allItems: any[] = [];
      for (const [key, val] of Object.entries(items)) {
        if (['character_suggestions', 'wardrobe_analysis'].includes(key)) continue;
        if (Array.isArray(val)) allItems.push(...val);
        else if (val && typeof val === 'object' && 'name' in (val as any)) allItems.push(val);
      }
      const fromWardrobe = allItems.filter((i: any) => i.source === 'from_wardrobe').length;
      const needsPurchase = allItems.filter((i: any) => i.source !== 'from_wardrobe').length;
      if (fromWardrobe > 0 && needsPurchase === 0) wardrobeState = 'full_match';
      else if (fromWardrobe > 0 && needsPurchase > 0) wardrobeState = 'partial';
      else wardrobeState = 'no_wardrobe';
    }

    const shoppingSectionTitle = wardrobeState === 'full_match' ? '' :
      (wardrobeState === 'no_wardrobe' || wardrobeState === 'explicit_shop') ? 'Shop This Look' : 'Complete Your Look';

    console.log(`[Wardrobe State] ${wardrobeState} → section: "${shoppingSectionTitle}"`);

    // ============================================
    // PRODUCT SEARCH: 4-Layer Strategy
    // ============================================

    let shoppingMatches: any[] = [];

    if (wardrobeState === 'full_match') {
      console.log('[Search] Skipping — full wardrobe match');
    } else {
      let itemsToSearch: any[] = [];
      const missingItemsFromAI = recommendationData.missing_items_search || [];

      if (wardrobeState === 'no_wardrobe') {
        const items = recommendationData.recommended_items || {};
        for (const [key, val] of Object.entries(items)) {
          if (['character_suggestions', 'wardrobe_analysis'].includes(key)) continue;
          if (Array.isArray(val)) {
            for (const v of val) {
              if (v && typeof v === 'object' && 'name' in v) {
                itemsToSearch.push({
                  item_type: v.name,
                  style_descriptor: v.reasoning || '',
                  occasion_suitability: occasion || '',
                  price_tier: missingItemsFromAI.find((m: any) => m.item_type === v.name)?.price_tier || 'mid_range',
                  category: key,
                  search_keywords: v.name.split(/\s+/).slice(0, 5),
                });
              }
            }
          } else if (val && typeof val === 'object' && 'name' in (val as any)) {
            const v = val as any;
            itemsToSearch.push({
              item_type: v.name,
              style_descriptor: v.reasoning || '',
              occasion_suitability: occasion || '',
              price_tier: missingItemsFromAI.find((m: any) => m.item_type === v.name)?.price_tier || 'mid_range',
              category: key,
              search_keywords: v.name.split(/\s+/).slice(0, 5),
            });
          }
        }
        const clothing = itemsToSearch.filter(i => !isAccessoryItem(i.item_type));
        const accessories = itemsToSearch.filter(i => isAccessoryItem(i.item_type));
        itemsToSearch = [...clothing, ...accessories.slice(0, 2)];
      } else if (wardrobeState === 'explicit_shop') {
        const items = recommendationData.recommended_items || {};
        for (const [key, val] of Object.entries(items)) {
          if (['character_suggestions', 'wardrobe_analysis'].includes(key)) continue;
          if (Array.isArray(val)) {
            for (const v of val) {
              if (v && typeof v === 'object' && 'name' in v) {
                itemsToSearch.push({
                  item_type: v.name,
                  style_descriptor: v.reasoning || '',
                  occasion_suitability: occasion || '',
                  price_tier: missingItemsFromAI.find((m: any) => m.item_type === v.name)?.price_tier || 'mid_range',
                  category: key,
                  search_keywords: v.name.split(/\s+/).slice(0, 5),
                });
              }
            }
          } else if (val && typeof val === 'object' && 'name' in (val as any)) {
            const v = val as any;
            itemsToSearch.push({
              item_type: v.name,
              style_descriptor: v.reasoning || '',
              occasion_suitability: occasion || '',
              price_tier: missingItemsFromAI.find((m: any) => m.item_type === v.name)?.price_tier || 'mid_range',
              category: key,
              search_keywords: v.name.split(/\s+/).slice(0, 5),
            });
          }
        }
      } else {
        itemsToSearch = missingItemsFromAI;
      }

      itemsToSearch = itemsToSearch.slice(0, 5);

      if (itemsToSearch.length > 0) {
        console.log('Searching for', itemsToSearch.length, 'items (state:', wardrobeState, ')');

        const getPriceLimit = (tier: string) => {
          if (tier === 'budget') return 50;
          if (tier === 'mid_range') return 150;
          if (tier === 'luxury') return 9999;
          return styleProfile?.budget_max || 500;
        };

        const shopStyleApiKey = Deno.env.get('SHOPSTYLE_API_KEY');
        const serperApiKey = Deno.env.get('SERPER_API_KEY');
        const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

        const searchShopStyle = async (query: string, maxPrice: number): Promise<any[]> => {
          if (!shopStyleApiKey) return [];
          try {
            const encoded = encodeURIComponent(query);
            const url = `https://api.shopstyle.com/api/v2/products?pid=${shopStyleApiKey}&fts=${encoded}&offset=0&limit=5&fl=p0:${maxPrice}&fl=d0:GB&fl=b0:GBP`;
            console.log(`[ShopStyle] Searching: "${query}" (max £${maxPrice})`);
            const response = await fetch(url);
            if (!response.ok) { console.warn('[ShopStyle] API error:', response.status); return []; }
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
                return {
                  retailer: r.source || 'Retailer',
                  product_name: r.title || 'Product',
                  price: !isNaN(numericPrice) ? `£${numericPrice.toFixed(2)}` : (priceStr || null),
                  numericPrice: !isNaN(numericPrice) ? numericPrice : null,
                  product_url: r.link || '',
                  image_url: r.imageUrl || null,
                  source: 'google_shopping',
                };
              })
              .filter((r: any) => r.numericPrice === null || r.numericPrice <= maxPrice)
              .slice(0, 5)
              .map(({ numericPrice, ...rest }: any) => rest);
            console.log(`[Serper] Found ${results.length} products for "${query}"`);
            return results;
          } catch (err) { console.warn('[Serper] Error:', err); return []; }
        };

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

        const enrichQuery = (itemName: string): string => {
          const wordCount = itemName.trim().split(/\s+/).length;
          if (wordCount <= 2 && occasion) return `${itemName} ${occasion}`.slice(0, 80);
          return itemName;
        };

        const searchPromises = itemsToSearch.map(async (item: any) => {
          const keywords = item.search_keywords || [];
          const category = item.category || '';
          const maxPrice = getPriceLimit(item.price_tier);
          const rawQuery = `${item.item_type} ${item.style_descriptor || ''}`.trim();
          const searchQuery = enrichQuery(rawQuery);
          const tier = item.price_tier || 'mid_range';

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

          let retailer_results = await searchShopStyle(searchQuery, maxPrice);
          if (retailer_results.length < 2) {
            const serperResults = await searchGoogleShopping(searchQuery, maxPrice);
            retailer_results = [...retailer_results, ...serperResults];
          }
          if (retailer_results.length === 0) {
            retailer_results = buildSearchUrls(searchQuery, tier);
          }
          retailer_results = retailer_results.slice(0, 6);

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

          console.log(`[Result] "${searchQuery}": ${retailer_results.length} retailer, ${rental_results.length} rental, ${secondhand_results.length} secondhand`);

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
      } else {
        savedRecommendation = dbRecommendation;
      }
    }

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
      shopping_section_title: shoppingSectionTitle,
      wardrobe_state: wardrobeState,
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
      // Return the follow-up question for the client to use
      follow_up_question: followUpQuestion,
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
