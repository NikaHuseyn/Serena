import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocation } from '@/hooks/useLocation';
import { toast } from 'sonner';
import { detectVenue, detectEvent, VenueDetectionResult } from './styling-chat/venueEventDetection';
import { extractLocation, extractFutureDate, formatDateLabel } from './styling-chat/weatherExtraction';
import { detectVagueVenue, getRelevantEmotionalTones, detectExplicitEmotionalGoal, EmotionalTone } from './styling-chat/vagueVenueDetection';
import {
  determineWardrobeState,
  getSectionTitle,
  searchProductsForItems,
  detectExplicitShopIntent,
  type RecommendedItem,
  type WardrobeState,
} from '@/services/productSearchService';

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
  /** Multi-tone recommendations keyed by tone id */
  toneRecommendations?: Record<string, {
    recommendation: any;
    content: string;
    missing_items?: any[];
  }>;
  /** Section title: "Shop This Look" or "Complete Your Look" */
  shoppingTitle?: string;
  timestamp: Date;
}

/** Flatten recommended_items object into array of RecommendedItem */
function flattenRecommendedItems(items: Record<string, any>): RecommendedItem[] {
  const result: RecommendedItem[] = [];
  const excludeKeys = ['character_suggestions', 'wardrobe_analysis'];
  Object.entries(items).forEach(([key, value]) => {
    if (excludeKeys.includes(key)) return;
    if (Array.isArray(value)) {
      result.push(...value.filter((v: any) => v && typeof v === 'object' && 'name' in v));
    } else if (value && typeof value === 'object' && 'name' in value) {
      result.push(value as RecommendedItem);
    }
  });
  return result;
}

export const useStylingChat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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

  /**
   * Build weather note string from weather data.
   */
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

  /**
   * Fetch weather data.
   */
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
        weatherData: { temperature: 55, condition: 'Partly Cloudy', location: 'London, UK', humidity: 65, source: 'fallback' },
        mentionedLocation,
        mentionedDate,
      };
    }
    return { weatherData: null, mentionedLocation, mentionedDate };
  }, [getLocation]);

  /**
   * Call the AI recommendation edge function.
   */
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

    const conversationContext = messages.map(m => ({
      role: m.role,
      content: m.content,
      recommendationSummary: m.recommendation ? {
        items: m.recommendation.recommended_items ? Object.keys(m.recommendation.recommended_items) : [],
        occasion: m.recommendation.occasion,
      } : undefined,
    }));

    const isFollowUp = messages.length > 0;
    const originalRequest = messages.find(m => m.role === 'user')?.content || '';

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
        guestEmail: session?.user?.email || `guest-${Date.now()}@temp.com`,
        ...extraContext,
      },
      headers
    });

    if (error) throw new Error(error.message || 'Failed to get recommendation');

    return { data, venueContext, eventContext };
  }, [messages, scrapeVenue, scrapeEvent]);

  /**
   * Core recommendation flow — called after venue/event detection is resolved.
   */
  const executeRecommendation = useCallback(async (
    userMessage: string,
    resolvedVenueName: string | null,
    detectedEventName: string | null,
    extraContext?: Record<string, any>,
  ) => {
    try {
      const { weatherData, mentionedLocation, mentionedDate } = await fetchWeather(userMessage);

      const { data, venueContext, eventContext } = await callRecommendation(
        userMessage, resolvedVenueName, detectedEventName, weatherData, extraContext,
      );

      const weatherNote = buildWeatherNote(weatherData, mentionedLocation, mentionedDate);

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

      // --- Product search based on wardrobe state ---
      let shoppingTitle: string | undefined;
      let searchedMissingItems: any[] | undefined;

      if (data?.recommendation?.recommended_items) {
        const flatItems = flattenRecommendedItems(data.recommendation.recommended_items);
        const wardrobeState = determineWardrobeState(
          data?.wardrobe_status,
          flatItems,
          userMessage,
        );

        if (wardrobeState !== 'full_match') {
          shoppingTitle = getSectionTitle(wardrobeState);
          const occasion = data.recommendation.occasion || userMessage;
          const budgetTier = data.recommendation.budget_tier;

          try {
            const productResults = await searchProductsForItems(
              flatItems,
              wardrobeState,
              occasion,
              budgetTier,
            );
            if (productResults.length > 0) {
              searchedMissingItems = productResults;
            }
          } catch (err) {
            console.warn('Product search failed, falling back to existing missing_items:', err);
          }
        }
      }

      const finalMissingItems = searchedMissingItems || data?.missing_items;

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: responseContent,
        recommendation: data?.recommendation ? {
          ...data.recommendation,
          ai_insights: data.ai_insights,
          missing_items: finalMissingItems,
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
   * Execute multi-tone recommendations for vague occasions.
   */
  const executeMultiToneRecommendation = useCallback(async (
    userMessage: string,
    vagueVenue: { inferredFormality: string; mealType: string | null; occasionType: string | null },
    tones: EmotionalTone[],
  ) => {
    try {
      const { weatherData, mentionedLocation, mentionedDate } = await fetchWeather(userMessage);
      const weatherNote = buildWeatherNote(weatherData, mentionedLocation, mentionedDate);

      // Generate recommendations for all tones in parallel
      const toneResults = await Promise.all(tones.map(async (tone) => {
        try {
          const { data } = await callRecommendation(
            userMessage, null, null, weatherData, {
              inferred_venue_formality: vagueVenue.inferredFormality,
              inferred_meal_type: vagueVenue.mealType,
              inferred_occasion_type: vagueVenue.occasionType,
              emotional_tone: tone.id,
              emotional_tone_label: tone.label,
              is_multi_tone: true,
            },
          );
          return {
            toneId: tone.id,
            recommendation: data?.recommendation ? {
              ...data.recommendation,
              ai_insights: data.ai_insights,
              missing_items: data.missing_items,
            } : undefined,
            content: data?.recommendation?.reasoning || `Here's a ${tone.label.toLowerCase()} look for this occasion.`,
            missing_items: data?.missing_items,
            wardrobeStatus: data?.wardrobe_status,
          };
        } catch (err) {
          console.warn(`Failed to generate ${tone.label} recommendation:`, err);
          return null;
        }
      }));

      const validResults = toneResults.filter(Boolean) as NonNullable<typeof toneResults[0]>[];

      // Build conversational intro
      const mealLabel = vagueVenue.mealType || 'occasion';
      let intro = '';
      if (vagueVenue.mealType === 'dinner') {
        intro = `A ${vagueVenue.inferredFormality === 'formal smart' ? 'fancy' : 'nice'} restaurant for dinner — I love that. Here are a few directions depending on the vibe you're going for tonight:`;
      } else if (vagueVenue.mealType === 'drinks') {
        intro = `Drinks out — exciting. Here are a few different vibes to choose from:`;
      } else if (vagueVenue.mealType === 'brunch') {
        intro = `Brunch plans — here are some styling directions to match the mood:`;
      } else {
        intro = `Great choice. Here are a few outfit directions depending on how you want to feel:`;
      }

      // Build tone recommendations map
      const toneRecommendations: Record<string, { recommendation: any; content: string; missing_items?: any[] }> = {};
      for (const result of validResults) {
        toneRecommendations[result.toneId] = {
          recommendation: result.recommendation,
          content: result.content,
          missing_items: result.missing_items,
        };
      }

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: intro,
        emotionalToneCards: tones,
        toneRecommendations,
        wardrobeStatus: validResults[0]?.wardrobeStatus || undefined,
        weatherNote,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);

    } catch (error) {
      console.error('Error in multi-tone styling chat:', error);
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

  /**
   * Handle emotional tone card selection.
   */
  const selectEmotionalTone = useCallback((toneId: string) => {
    setSelectedEmotionalTone(toneId);
  }, []);

  const sendMessage = useCallback(async (userMessage: string) => {
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
      // First check for specific named venue
      const venueResult: VenueDetectionResult | null = detectVenue(userMessage);
      const detectedEvent = detectEvent(userMessage);

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
        // Pass selected emotional tone as context if present
        const extraContext: Record<string, any> = {};
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
          // Vague occasion, no explicit tone → generate multi-tone options
          const tones = getRelevantEmotionalTones(vagueVenue.mealType, vagueVenue.occasionType);
          await executeMultiToneRecommendation(userMessage, vagueVenue, tones);
        } else {
          // Either explicit tone, previously selected tone, or non-venue request
          const extraContext: Record<string, any> = {};
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
  }, [messages, pendingVenue, selectedEmotionalTone, executeRecommendation, executeMultiToneRecommendation]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setPendingVenue(null);
    setSelectedEmotionalTone(null);
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
