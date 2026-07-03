import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocation } from '@/hooks/useLocation';
import { toast } from 'sonner';
import { detectVenue, detectEvent, VenueDetectionResult } from './styling-chat/venueEventDetection';
import { extractLocation, extractFutureDate, formatDateLabel } from './styling-chat/weatherExtraction';
import { detectVagueVenue, getRelevantEmotionalTones, detectExplicitEmotionalGoal, EmotionalTone } from './styling-chat/vagueVenueDetection';

// Feature flag: when true, chat uses the new oracle-styling edge function
// (v2, tool-schema based). Flip to false to roll back to the legacy
// generate-ai-recommendations path — both are wired end to end.
const USE_ORACLE_V2 = true;

const KNOWN_DRESS_CODES = [
  'black tie', 'white tie',
  'black tie optional',
  'creative black tie',
  'smart casual', 'business casual',
  'cocktail', 'cocktail attire',
  'formal', 'semi formal', 'semi-formal',
  'casual', 'beach casual',
  'garden party', 'lounge suit',
  'morning dress', 'festive',
  'resort casual'
];

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  recommendation?: any;
  venueContext?: any;
  eventContext?: any;
  culturalContext?: {
    country: string;
    norms: Array<{ context_type: string; guidance: string }>;
  } | null;
  /** When set, the UI should render tappable city chips for venue disambiguation */
  cityClarificationChips?: string[];
  /** One-line weather context shown above recommendation */
  weatherNote?: string;
  /** Wardrobe status from the backend */
  wardrobeStatus?: {
    is_authenticated: boolean;
    wardrobe_count: number;
    has_wardrobe: boolean;
  };
  /** Emotional tone cards for vague occasions */
  emotionalToneCards?: EmotionalTone[];
  /** Tone-specific recommendations returned after selecting an emotional tone */
  toneRecommendations?: any;
  /** Section title: "Shop This Look" or "Complete Your Look" */
  shoppingTitle?: string;
  /** Oracle v2: which mode the model responded in */
  mode?: 'wardrobe_only' | 'shop_new';
  /** Oracle v2: sticky rental preference for the conversation */
  rental_preference?: 'both' | 'buy_only' | 'rent_only';
  /** Oracle v2: option cards rendered below the reply */
  outfit_options?: any[];
  timestamp: Date;
}

/** Accumulated conversation context passed to every Oracle call */
interface ConversationContext {
  location: string | null;
  venue_type: string | null;
  dress_code: string | null;
  emotional_goal: string | null;
  who_with: string | null;
  budget: string | null;
  date: string | null;
  style_preferences: string[];
  liked_items: string[];
  rejected_items: string[];
  exchange_count: number;
}

export const useStylingChat = () => {
  // Restore guest conversation from sessionStorage on mount
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = sessionStorage.getItem('guest_chat_messages');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
      }
    } catch { /* ignore */ }
    return [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const { getLocation } = useLocation({ showToasts: false });

  // Tracks a pending venue that needs city clarification before we can scrape
  const [pendingVenue, setPendingVenue] = useState<{
    originalMessage: string;
    venueName: string;
    possibleCities: string[];
  } | null>(null);

  // Tracks selected emotional tone for follow-up context
  const [selectedEmotionalTone, setSelectedEmotionalTone] = useState<string | null>(null);

  // Accumulated conversation context
  const [conversationCtx, setConversationCtx] = useState<ConversationContext>({
    location: null,
    venue_type: null,
    dress_code: null,
    emotional_goal: null,
    who_with: null,
    budget: null,
    date: null,
    style_preferences: [],
    liked_items: [],
    rejected_items: [],
    exchange_count: 0,
  });

  // Track whether we've already migrated in this hook instance
  const hasMigratedRef = useRef(false);

  // Persist guest messages to sessionStorage whenever they change
  useEffect(() => {
    const checkAndPersist = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session && messages.length > 0) {
        sessionStorage.setItem('guest_chat_messages', JSON.stringify(messages));
        sessionStorage.setItem('guest_chat_context', JSON.stringify(conversationCtx));
      }
    };
    checkAndPersist();
  }, [messages, conversationCtx]);

  // Listen for auth state change to migrate guest conversation
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN') && session && !hasMigratedRef.current) {
        const storedMessages = sessionStorage.getItem('guest_chat_messages');
        if (!storedMessages) return;

        hasMigratedRef.current = true;
        try {
          const guestMessages: ChatMessage[] = JSON.parse(storedMessages);
          if (guestMessages.length === 0) return;

          // Restore messages into state so user sees them immediately
          setMessages(guestMessages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })));

          // Save a summary to ai_recommendations so it persists server-side
          const userMessages = guestMessages.filter(m => m.role === 'user').map(m => m.content);
          const assistantMessages = guestMessages.filter(m => m.role === 'assistant');
          const lastRec = [...assistantMessages].reverse().find(m => m.recommendation);

          await supabase.from('ai_recommendations').insert({
            user_id: session.user.id,
            recommendation_type: 'migrated_guest_session',
            occasion: userMessages[0] || 'Guest conversation',
            reasoning: `Migrated guest conversation (${guestMessages.length} messages): ${userMessages.join(' | ')}`,
            recommended_items: lastRec?.recommendation?.recommended_items || [],
            weather_context: { migrated: true, message_count: guestMessages.length },
          });

          console.log('Migrated guest conversation to authenticated account');
        } catch (err) {
          console.warn('Failed to migrate guest conversation:', err);
        } finally {
          // Clear guest data
          sessionStorage.removeItem('guest_chat_messages');
          sessionStorage.removeItem('guest_chat_context');
          sessionStorage.removeItem('guest_session_id');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);


  const updateContextFromMessage = useCallback((message: string) => {
    setConversationCtx(prev => {
      const ctx = { ...prev };
      const msg = message.toLowerCase();

      // Location detection
      const cities = ['london', 'paris', 'new york', 'dubai', 'tokyo', 'milan', 'barcelona', 'rome', 'berlin', 'amsterdam', 'istanbul', 'bangkok', 'singapore', 'mumbai', 'los angeles', 'chicago', 'sydney', 'melbourne', 'toronto', 'vancouver'];
      for (const city of cities) {
        if (msg.includes(city)) { ctx.location = city.charAt(0).toUpperCase() + city.slice(1); break; }
      }

      // Who with
      if (/\b(date|romantic|partner|boyfriend|girlfriend|husband|wife)\b/i.test(msg)) ctx.who_with = 'date';
      else if (/\b(friends?|mates?|girls?|guys?|lads?|group)\b/i.test(msg)) ctx.who_with = 'friends';
      else if (/\b(work|business|corporate|client|colleague|networking|boss)\b/i.test(msg)) ctx.who_with = 'work';
      else if (/\b(family|parents?|in-?laws?|mum|dad|mother|father)\b/i.test(msg)) ctx.who_with = 'family';

      // Budget
      const budgetMatch = msg.match(/(?:budget|spend|under|around|about)\s*(?:is\s*)?[£$]?\s*(\d+)/i) || msg.match(/[£$](\d+)/);
      if (budgetMatch) ctx.budget = `£${budgetMatch[1]}`;
      if (/no\s*(?:budget|limit)/i.test(msg)) ctx.budget = 'no limit';

      // Emotional goal
      if (/\b(romantic|sexy|seductive|alluring)\b/i.test(msg)) ctx.emotional_goal = 'romantic';
      else if (/\b(professional|polished|powerful|authoritative)\b/i.test(msg)) ctx.emotional_goal = 'polished';
      else if (/\b(warm|friendly|approachable|comfortable)\b/i.test(msg)) ctx.emotional_goal = 'warm';
      else if (/\b(chic|effortless|elegant|sophisticated)\b/i.test(msg)) ctx.emotional_goal = 'chic';
      else if (/\b(bold|striking|dramatic|head-?turning)\b/i.test(msg)) ctx.emotional_goal = 'bold';
      else if (/\b(cool|edgy|trendy|minimal|sleek)\b/i.test(msg)) ctx.emotional_goal = 'cool';
      else if (/\b(fun|colourful|colorful|playful|vibrant)\b/i.test(msg)) ctx.emotional_goal = 'fun';
      else if (/\b(relaxed|laid-?back|casual|chill)\b/i.test(msg)) ctx.emotional_goal = 'relaxed';

      // Date
      if (/\b(today|tonight)\b/i.test(msg)) ctx.date = 'today';
      else if (/\b(tomorrow)\b/i.test(msg)) ctx.date = 'tomorrow';
      else if (/\b(this weekend|saturday|sunday)\b/i.test(msg)) ctx.date = 'this weekend';

      // Dress code
      if (/\b(black tie|white tie|black tie optional|creative black tie)\b/i.test(msg)) {
        ctx.dress_code = 'black tie';
      } else if (/\b(cocktail|cocktail attire)\b/i.test(msg)) {
        ctx.dress_code = 'cocktail';
      } else if (/\b(smart casual|business casual)\b/i.test(msg)) {
        ctx.dress_code = 'smart casual';
      } else if (/\b(lounge suit|morning dress)\b/i.test(msg)) {
        ctx.dress_code = 'formal';
      } else if (/\b(beach casual|resort casual|garden party)\b/i.test(msg)) {
        ctx.dress_code = 'casual';
      } else if (/\b(semi.?formal)\b/i.test(msg)) {
        ctx.dress_code = 'semi-formal';
      }

      // Venue type
      if (/\b(restaurant|dining)\b/i.test(msg)) ctx.venue_type = 'restaurant';
      else if (/\b(bar|pub|club|lounge)\b/i.test(msg)) ctx.venue_type = 'bar';
      else if (/\b(cafe|café|coffee)\b/i.test(msg)) ctx.venue_type = 'café';
      else if (/\b(gallery|museum|exhibition)\b/i.test(msg)) ctx.venue_type = 'gallery';
      else if (/\b(theatre|theater|concert|show)\b/i.test(msg)) ctx.venue_type = 'theatre';

      ctx.exchange_count = prev.exchange_count + 1;
      return ctx;
    });
  }, []);

  const scrapeVenue = useCallback(async (venueName: string) => {
    try {
      console.log('Detecting venue, scraping:', venueName);
      const { data, error } = await supabase.functions.invoke('scrape-venue', {
        body: { venueName },
      });

      if (error) {
        console.warn('Venue scrape error, falling back to name-only:', error);
        return { venue_name: venueName, source: 'name_only' };
      }

      if (data?.success && data?.venueContext) {
        const vc = data.venueContext;
        const hasUsefulInfo = vc.dress_code !== 'none_specified' || vc.atmosphere || vc.formality_level;
        if (hasUsefulInfo) {
          console.log('Venue context extracted:', vc);
          return { ...vc, source: 'scraped' };
        }
        console.log('Scraped venue but no useful dress code info, falling back to name-only');
        return { venue_name: vc.venue_name || venueName, venue_type: vc.venue_type, source: 'name_only' };
      }

      return { venue_name: venueName, source: 'name_only' };
    } catch (err) {
      console.warn('Venue scrape failed, falling back to name-only:', err);
      return { venue_name: venueName, source: 'name_only' };
    }
  }, []);

  const scrapeEvent = useCallback(async (eventName: string) => {
    try {
      console.log('Detecting event, scraping:', eventName);
      const { data, error } = await supabase.functions.invoke('scrape-event', {
        body: { eventName },
      });

      if (error) {
        console.warn('Event scrape error, falling back to name-only:', error);
        return { event_name: eventName, source: 'name_only' };
      }

      if (data?.success && data?.eventContext) {
        const ec = data.eventContext;
        const hasUsefulInfo = ec.dress_code !== 'none_specified' || ec.indoor_outdoor !== 'unknown' || ec.time_of_day !== 'unknown' || ec.style_guidance;
        if (hasUsefulInfo) {
          console.log('Event context extracted:', ec);
          return { ...ec, source: 'scraped' };
        }
        console.log('Scraped event but no useful info, falling back to name-only');
        return { event_name: ec.event_name || eventName, event_type: ec.event_type, source: 'name_only' };
      }

      return { event_name: eventName, source: 'name_only' };
    } catch (err) {
      console.warn('Event scrape failed, falling back to name-only:', err);
      return { event_name: eventName, source: 'name_only' };
    }
  }, []);

  function getWeatherIcon(condition: string): string {
    const c = (condition || '').toLowerCase();
    if (c.includes('rain') || c.includes('drizzle')) return '🌧';
    if (c.includes('thunder')) return '⛈';
    if (c.includes('snow')) return '🌨';
    if (c.includes('cloud') || c.includes('overcast')) return '☁️';
    if (c.includes('fog') || c.includes('mist')) return '🌫';
    if (c.includes('clear') || c.includes('sunny')) return '☀️';
    return '🌤';
  }

  const buildWeatherNote = useCallback((weatherData: any, mentionedLocation: string | null, mentionedDate: string | null): string | undefined => {
    if (!weatherData || weatherData.temperature == null) return undefined;
    const weatherIcon = getWeatherIcon(weatherData.condition);
    const locationDisplay = weatherData.source === 'current_location'
      ? 'Your current location'
      : (weatherData.location || mentionedLocation || 'Unknown');
    const dayLabel = formatDateLabel(mentionedDate) || (weatherData.forecastDate ? formatDateLabel(weatherData.forecastDate) : null);
    const dayPart = dayLabel ? `, ${dayLabel}` : '';
    const conditionDesc = weatherData.description
      ? weatherData.description.charAt(0).toUpperCase() + weatherData.description.slice(1)
      : weatherData.condition;
    return `${weatherIcon} ${locationDisplay}${dayPart}: ${weatherData.temperature}°C, ${conditionDesc}`;
  }, []);

  const fetchWeather = useCallback(async (userMessage: string) => {
    const mentionedLocation = extractLocation(userMessage);
    const mentionedDate = extractFutureDate(userMessage);

    try {
      if (mentionedLocation) {
        console.log('Fetching weather for mentioned location:', mentionedLocation);
        const { data } = await supabase.functions.invoke('weather-recommendations', {
          body: {
            location: mentionedLocation,
            ...(mentionedDate ? { forecastDate: mentionedDate } : {}),
          }
        });
        return { weatherData: data ? { ...data, source: 'mentioned_location' } : null, mentionedLocation, mentionedDate };
      } else {
        const coordinates = await getLocation();
        if (coordinates) {
          const { data } = await supabase.functions.invoke('weather-recommendations', {
            body: {
              lat: coordinates.latitude,
              lon: coordinates.longitude,
              ...(mentionedDate ? { forecastDate: mentionedDate } : {}),
            }
          });
          return {
            weatherData: data ? { ...data, source: 'current_location', location_label: 'your current location' } : null,
            mentionedLocation,
            mentionedDate,
          };
        }
      }
    } catch {
      return {
        weatherData: null,
        mentionedLocation,
        mentionedDate,
      };
    }
    return { weatherData: null, mentionedLocation, mentionedDate };
  }, [getLocation]);

  const callRecommendation = useCallback(async (
    userMessage: string,
    resolvedVenueName: string | null,
    detectedEventName: string | null,
    weatherData: any,
    extraContext?: Record<string, any>,
  ) => {
    const [venueContext, eventContext] = await Promise.all([
      resolvedVenueName ? scrapeVenue(resolvedVenueName) : Promise.resolve(null),
      detectedEventName ? scrapeEvent(detectedEventName) : Promise.resolve(null),
    ]);

    const { data: { session } } = await supabase.auth.getSession();
    const headers = session ? { Authorization: `Bearer ${session.access_token}` } : {};

    // Truncate to last 10 messages to prevent token bloat and high costs
    const recentMessages = messages.slice(-10);
    const conversationContext = recentMessages.map(m => ({
      role: m.role,
      content: m.content,
      recommendationSummary: m.recommendation ? {
        items: m.recommendation.recommended_items ? Object.keys(m.recommendation.recommended_items) : [],
        occasion: m.recommendation.occasion,
      } : undefined,
    }));

    const isFollowUp = messages.length > 0;
    const originalRequest = messages.find(m => m.role === 'user')?.content || '';

    // -----------------------------------------------------------------
    // Oracle v2 path (feature-flagged). Old path kept below for rollback.
    // -----------------------------------------------------------------
    if (USE_ORACLE_V2) {
      const oracleHistory = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const { data: resp, error } = await supabase.functions.invoke('oracle-styling', {
        body: {
          message: userMessage,
          conversationHistory: oracleHistory,
          accumulated_context: extraContext?.accumulated_context ?? null,
          weatherData,
          venueContext: venueContext || null,
          eventContext: eventContext || null,
          anchor_item_id: null,
        },
        headers,
      });

      if (error) throw new Error(error.message || 'Failed to get recommendation');

      // Edge function returns { success: true, data: parsed }; accept the
      // bare parsed shape too so future changes don't break the client.
      const parsed = resp?.data ?? resp ?? {};
      const normalized = {
        // Map reply_text → assistant message content downstream.
        recommendation: { reasoning: parsed.reply_text || '' },
        follow_up_question: parsed.follow_up_question || undefined,
        // Passed through onto the ChatMessage in the builders below.
        oracle_v2: {
          mode: parsed.mode,
          rental_preference: parsed.rental_preference,
          outfit_options: parsed.outfit_options,
        },
      };

      return { data: normalized, venueContext, eventContext };
    }

    const { data, error } = await supabase.functions.invoke('generate-ai-recommendations', {
      body: {
        recommendationType: 'event_outfit',
        weatherData,
        occasion: userMessage,
        eventDetails: { name: userMessage, type: 'event' },
        venueContext: venueContext || undefined,
        eventContext: eventContext || undefined,
        conversationHistory: isFollowUp ? conversationContext : [],
        originalRequest: isFollowUp ? originalRequest : null,
        guestEmail: session?.user?.email || (() => {
          let guestId = sessionStorage.getItem('guest_session_id');
          if (!guestId) {
            guestId = `guest-${Math.random().toString(36).substr(2, 9)}`;
            sessionStorage.setItem('guest_session_id', guestId);
          }
          return `${guestId}@guest.temp`;
        })(),
        user_message: userMessage,
        ...extraContext,
      },
      headers
    });

    if (error) throw new Error(error.message || 'Failed to get recommendation');

    return { data, venueContext, eventContext };
  }, [messages, scrapeVenue, scrapeEvent]);

  const executeRecommendation = useCallback(async (
    userMessage: string,
    resolvedVenueName: string | null,
    detectedEventName: string | null,
    extraContext?: Record<string, any>,
  ) => {
    try {
      const { weatherData, mentionedLocation, mentionedDate } = await fetchWeather(userMessage);

      const shouldBlockWeather = 
        !weatherData ||
        weatherData?.source === 'current_location' || 
        weatherData?.source === 'gps' ||
        weatherData?.source === 'fallback';
      const weatherDataForApi = shouldBlockWeather ? null : weatherData;

      const { data, venueContext, eventContext } = await callRecommendation(
        userMessage, resolvedVenueName, detectedEventName, weatherDataForApi, extraContext,
      );

      let weatherNote = shouldBlockWeather ? null : buildWeatherNote(weatherData, mentionedLocation, mentionedDate);

      let responseContent = '';

      if (venueContext?.source === 'scraped') {
        const dressCodeText = venueContext.dress_code !== 'none_specified'
          ? `**Dress code:** ${venueContext.dress_code_details || venueContext.dress_code}`
          : '';
        const atmosphereText = venueContext.atmosphere ? `**Atmosphere:** ${venueContext.atmosphere}` : '';
        const venueInfo = [dressCodeText, atmosphereText].filter(Boolean).join('\n');
        if (venueInfo) {
          responseContent += `📍 I found info about **${venueContext.venue_name || resolvedVenueName}**:\n${venueInfo}\n\n`;
        }
      }

      if (eventContext?.source === 'scraped') {
        const parts: string[] = [];
        if (eventContext.dress_code && eventContext.dress_code !== 'none_specified') {
          parts.push(`**Dress code:** ${eventContext.dress_code_details || eventContext.dress_code}`);
        }
        if (eventContext.indoor_outdoor && eventContext.indoor_outdoor !== 'unknown') {
          parts.push(`**Setting:** ${eventContext.indoor_outdoor}`);
        }
        if (eventContext.time_of_day && eventContext.time_of_day !== 'unknown') {
          parts.push(`**Time:** ${eventContext.time_of_day}`);
        }
        if (eventContext.practical_notes) {
          parts.push(`**Note:** ${eventContext.practical_notes}`);
        }
        if (parts.length > 0) {
          responseContent += `🎫 I found info about **${eventContext.event_name || detectedEventName}**:\n${parts.join('\n')}\n\n`;
        }
      }

      if (data?.recommendation?.reasoning) {
        responseContent += data.recommendation.reasoning;
      } else if (data?.recommendation?.recommended_items) {
        responseContent += "Here's what I recommend for you:";
      } else {
        responseContent += "I've put together some styling suggestions based on your request.";
      }

      // FIX 5: Append follow-up question only if not already in responseContent
      const followUp = data?.follow_up_question;
      if (followUp && !responseContent.trim().endsWith(followUp.trim())) {
        responseContent += '\n\n' + followUp;
      }

      const shoppingTitle = data?.shopping_section_title || undefined;

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: responseContent,
        recommendation: data?.recommendation ? {
          ...data.recommendation,
          ai_insights: data.ai_insights,
          missing_items: data.missing_items,
        } : undefined,
        venueContext: venueContext || undefined,
        eventContext: eventContext || undefined,
        culturalContext: data?.cultural_context || undefined,
        wardrobeStatus: data?.wardrobe_status || undefined,
        shoppingTitle,
        weatherNote,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);

    } catch (error) {
      console.error('Error in styling chat:', error);
      toast.error('Something went wrong. Please try again.');

      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "I'm sorry, I couldn't process your request. Please try again or rephrase your question.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    }
  }, [messages, fetchWeather, callRecommendation, buildWeatherNote]);

  /**
   * For vague occasions, generate a single immediate recommendation
   * and show emotional tone cards as refinement options (lazy-loaded on select).
   */
  const executeVagueRecommendation = useCallback(async (
    userMessage: string,
    vagueVenue: { inferredFormality: string; mealType: string | null; occasionType: string | null },
    tones: EmotionalTone[],
  ) => {
    try {
      const { weatherData, mentionedLocation, mentionedDate } = await fetchWeather(userMessage);
      
      // Single call — Oracle picks a sensible default tone
      const shouldBlockWeather = 
        !weatherData ||
        weatherData?.source === 'current_location' || 
        weatherData?.source === 'gps' ||
        weatherData?.source === 'fallback';
      const weatherDataForApi = shouldBlockWeather ? null : weatherData;

      const { data, venueContext, eventContext } = await callRecommendation(
        userMessage, null, null, weatherDataForApi, {
          inferred_venue_formality: vagueVenue.inferredFormality,
          inferred_meal_type: vagueVenue.mealType,
          inferred_occasion_type: vagueVenue.occasionType,
        },
      );

      const weatherNote = shouldBlockWeather ? null : buildWeatherNote(weatherData, mentionedLocation, mentionedDate);

      let responseContent = data?.recommendation?.reasoning
        || "Here's what I'd suggest for this occasion:";

      const shoppingTitle = data?.shopping_section_title || undefined;

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: responseContent,
        recommendation: data?.recommendation ? {
          ...data.recommendation,
          ai_insights: data.ai_insights,
          missing_items: data.missing_items,
        } : undefined,
        emotionalToneCards: tones,
        wardrobeStatus: data?.wardrobe_status || undefined,
        shoppingTitle,
        weatherNote,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);

    } catch (error) {
      console.error('Error in vague styling chat:', error);
      toast.error('Something went wrong. Please try again.');
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "I'm sorry, I couldn't process your request. Please try again or rephrase your question.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    }
  }, [fetchWeather, callRecommendation, buildWeatherNote]);

  const selectEmotionalTone = useCallback(async (toneId: string) => {
    setSelectedEmotionalTone(toneId);
    setConversationCtx(prev => ({ ...prev, emotional_goal: toneId }));

    // Find the original user message that triggered the tone cards
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;

    // Find the tone label for display
    const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant' && m.emotionalToneCards);
    const toneInfo = lastAssistantMsg?.emotionalToneCards?.find((t: EmotionalTone) => t.id === toneId);
    const toneLabel = toneInfo?.label || toneId;

    setIsLoading(true);
    try {
      const vagueVenue = detectVagueVenue(lastUserMsg.content);
      const extraContext: Record<string, any> = { emotional_tone: toneId };
      if (conversationCtx.dress_code) {
        extraContext.known_dress_code = conversationCtx.dress_code;
      }
      if (vagueVenue) {
        extraContext.inferred_venue_formality = vagueVenue.inferredFormality;
        extraContext.inferred_meal_type = vagueVenue.mealType;
        extraContext.inferred_occasion_type = vagueVenue.occasionType;
      }
      await executeRecommendation(lastUserMsg.content, null, null, extraContext);
    } finally {
      setIsLoading(false);
    }
  }, [messages, executeRecommendation]);

  const sendMessage = useCallback(async (userMessage: string) => {
    // Update accumulated context from this message
    updateContextFromMessage(userMessage);

    // --- Handle pending venue city clarification ---
    if (pendingVenue) {
      const selectedCity = userMessage.trim();
      const resolvedName = `${pendingVenue.venueName} ${selectedCity}`;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: selectedCity,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userMsg]);
      setIsLoading(true);

      const originalMessage = pendingVenue.originalMessage;
      setPendingVenue(null);

      try {
        const detectedEvent = detectEvent(originalMessage);
        await executeRecommendation(originalMessage, resolvedName, detectedEvent);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // --- Normal message flow ---
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      // Strip explicit dress code phrases before venue/event detection
      const strippedForVenue = KNOWN_DRESS_CODES
        .reduce((msg, code) => msg.replace(new RegExp(`\\b${code}\\b`, 'gi'), ''), userMessage)
        .trim();

      // First check for specific named venue
      const venueResult: VenueDetectionResult | null = detectVenue(strippedForVenue);
      const detectedEvent = detectEvent(strippedForVenue);

      // If venue is ambiguous (multi-city, no city specified), ask the user
      if (venueResult?.isMultiCity) {
        setPendingVenue({
          originalMessage: userMessage,
          venueName: venueResult.venueName,
          possibleCities: venueResult.possibleCities,
        });

        const clarificationMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: `I found a few **${venueResult.venueName}** locations around the world — which city are you heading to?`,
          cityClarificationChips: venueResult.possibleCities,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, clarificationMsg]);
        setIsLoading(false);
        return;
      }

      // Resolve venue name (with city if detected)
      let resolvedVenueName: string | null = null;
      if (venueResult) {
        resolvedVenueName = venueResult.city
          ? `${venueResult.venueName} ${venueResult.city}`
          : venueResult.venueName;
      }

      // If we have a specific venue or event, do normal flow
      if (resolvedVenueName || detectedEvent) {
        const extraContext: Record<string, any> = {};
        if (conversationCtx.dress_code) {
          extraContext.known_dress_code = conversationCtx.dress_code;
        }
        if (selectedEmotionalTone) {
          extraContext.emotional_tone = selectedEmotionalTone;
        }
        await executeRecommendation(userMessage, resolvedVenueName, detectedEvent, extraContext);
      } else {
        // Check for vague venue description
        const vagueVenue = detectVagueVenue(userMessage);

        // Check if user already specified an emotional goal
        const explicitTone = detectExplicitEmotionalGoal(userMessage);

        if (vagueVenue && !explicitTone && !selectedEmotionalTone) {
          // Vague occasion, no explicit tone → single immediate recommendation + tone cards as refinement
          const tones = getRelevantEmotionalTones(vagueVenue.mealType, vagueVenue.occasionType);
          await executeVagueRecommendation(userMessage, vagueVenue, tones);
        } else {
          // Either explicit tone, previously selected tone, or non-venue request
          const extraContext: Record<string, any> = {};
          if (conversationCtx.dress_code) {
            extraContext.known_dress_code = conversationCtx.dress_code;
          }
          if (vagueVenue) {
            extraContext.inferred_venue_formality = vagueVenue.inferredFormality;
            extraContext.inferred_meal_type = vagueVenue.mealType;
            extraContext.inferred_occasion_type = vagueVenue.occasionType;
          }
          if (explicitTone) {
            extraContext.emotional_tone = explicitTone;
          } else if (selectedEmotionalTone) {
            extraContext.emotional_tone = selectedEmotionalTone;
          }
          await executeRecommendation(userMessage, resolvedVenueName, detectedEvent, extraContext);
        }
      }
    } catch (error) {
      console.error('Error in styling chat:', error);
      toast.error('Something went wrong. Please try again.');

      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "I'm sorry, I couldn't process your request. Please try again or rephrase your question.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, pendingVenue, selectedEmotionalTone, conversationCtx, updateContextFromMessage, executeRecommendation, executeVagueRecommendation]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setPendingVenue(null);
    setSelectedEmotionalTone(null);
    setConversationCtx({
      location: null,
      venue_type: null,
      dress_code: null,
      emotional_goal: null,
      who_with: null,
      budget: null,
      date: null,
      style_preferences: [],
      liked_items: [],
      rejected_items: [],
      exchange_count: 0,
    });
    sessionStorage.removeItem('guest_chat_messages');
    sessionStorage.removeItem('guest_chat_context');
    sessionStorage.removeItem('guest_session_id');
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    clearChat,
    selectEmotionalTone,
    selectedEmotionalTone,
  };
};
