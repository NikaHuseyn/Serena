import React, { useState } from 'react';
import { User, Sparkles, ShoppingBag, Tag, MapPin, Ticket, Globe, X, Shirt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import CompleteYourLook from './CompleteYourLook';
import EmotionalToneCards from './EmotionalToneCards';
import OutfitOptionCards from './OutfitOptionCards';

interface OutfitItem {
  name: string;
  reasoning?: string;
  source?: string;
  wardrobe_item_id?: string | null;
}

interface EmotionalTone {
  id: string;
  emoji: string;
  label: string;
  description: string;
}

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  recommendation?: any;
  venueContext?: any;
  eventContext?: any;
  culturalContext?: {
    country: string;
    norms: Array<{ context_type: string; guidance: string }>;
  } | null;
  cityClarificationChips?: string[];
  onCitySelect?: (city: string) => void;
  weatherNote?: string;
  wardrobeStatus?: {
    is_authenticated: boolean;
    wardrobe_count: number;
    has_wardrobe: boolean;
  };
  emotionalToneCards?: EmotionalTone[];
  toneRecommendations?: any;
  selectedToneId?: string | null;
  onSelectTone?: (toneId: string) => void;
  isLoading?: boolean;
  shoppingTitle?: string;
  isFirstGuestResponse?: boolean;
  /** Oracle v2 option cards */
  outfit_options?: any[];
  mode?: 'wardrobe_only' | 'shop_new';
  rental_preference?: 'both' | 'buy_only' | 'rent_only';
  styling_category?: 'womenswear' | 'menswear' | 'mixed';
  onSendMessage?: (message: string) => void;
}

const ChatMessage = ({ role, content, recommendation, venueContext, eventContext, culturalContext, cityClarificationChips, onCitySelect, weatherNote, wardrobeStatus, emotionalToneCards, toneRecommendations, selectedToneId, onSelectTone, isLoading, shoppingTitle, isFirstGuestResponse, outfit_options, mode, rental_preference, styling_category, onSendMessage }: ChatMessageProps) => {
  const isUser = role === 'user';
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const renderOutfitItem = (item: OutfitItem, index: number) => {
    const isFromWardrobe = item.source === 'from_wardrobe';

    return (
      <div key={index} className="mb-3 pl-4 border-l-2 border-border">
        <div className="flex items-center gap-2">
          <p className="text-foreground font-medium">{item.name}</p>
          {isFromWardrobe && (
            <Badge variant="secondary" className="text-[10px] h-5 gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
              <Shirt className="h-3 w-3" />
              Already in your wardrobe ✓
            </Badge>
          )}
        </div>
        {item.reasoning && (
          <p className="text-sm text-muted-foreground mt-1">{item.reasoning}</p>
        )}
      </div>
    );
  };

  const flattenItems = (items: Record<string, OutfitItem | OutfitItem[]>): OutfitItem[] => {
    const result: OutfitItem[] = [];
    const excludeKeys = ['character_suggestions', 'wardrobe_analysis'];
    
    Object.entries(items).forEach(([key, value]) => {
      if (excludeKeys.includes(key)) return;
      if (Array.isArray(value)) {
        result.push(...value);
      } else if (value && typeof value === 'object' && 'name' in value) {
        result.push(value);
      }
    });
    return result;
  };

  const renderWardrobeBanner = () => {
    if (bannerDismissed) return null;

    // Logged in, no wardrobe
    if (wardrobeStatus?.is_authenticated && !wardrobeStatus.has_wardrobe) {
      return (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-primary/5 border border-primary/20 px-4 py-2.5 mb-3">
          <p className="text-sm text-foreground">
            ✨ Add your wardrobe to get outfit suggestions from clothes you already own →{' '}
            <Link to="/wardrobe" className="font-medium text-primary hover:underline">
              Add items
            </Link>
          </p>
          <button
            onClick={() => setBannerDismissed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      );
    }
    return null;
  };

  const renderRecommendation = () => {
    if (!recommendation) return null;

    const hasRealProducts = recommendation?.missing_items?.some((item: any) =>
      item.retailer_results?.length > 0 ||
      item.rental_results?.some(
        (r: any) => !r.product_name?.startsWith('Search')
      )
    );

    const hasWardrobeItemsUsed = recommendation?.ai_insights?.wardrobe_analysis?.items_used?.length > 0;

    // No outfit items / styling tips / shop-this-look if we have no real products yet
    // (first response with empty or search-only placeholders should not show these sections)
    if (!hasRealProducts && !hasWardrobeItemsUsed) {
      return null;
    }

    const items = recommendation.recommended_items;
    if (!items) return null;

    const flatItems = flattenItems(items);

    return (
      <div className="mt-4 space-y-2">
        <div className="space-y-1">
          {flatItems.map((item, idx) => renderOutfitItem(item, idx))}
        </div>

        {recommendation.missing_items?.length > 0 && (
          <CompleteYourLook
            missingItems={recommendation.missing_items}
            title={shoppingTitle}
          />
        )}

        {recommendation.ai_insights?.styling_tips?.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <span className="text-sm font-medium text-muted-foreground">Styling Tips</span>
            <ul className="mt-2 space-y-1">
              {recommendation.ai_insights.styling_tips.map((tip: string, idx: number) => (
                <li key={idx} className="text-sm text-foreground">• {tip}</li>
              ))}
            </ul>
          </div>
        )}

        {recommendation.ai_insights?.wardrobe_analysis?.items_used?.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <span className="text-sm font-medium text-muted-foreground">From Your Wardrobe</span>
            <ul className="mt-2 space-y-1">
              {recommendation.ai_insights.wardrobe_analysis.items_used.map((item: string, idx: number) => (
                <li key={idx} className="text-sm text-foreground">✓ {item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex gap-4 py-6">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 pt-1">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-4 py-6 ${isUser ? '' : 'bg-muted/30'}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-primary text-primary-foreground' : 'bg-primary/10'
      }`}>
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Sparkles className="h-4 w-4 text-primary" />
        )}
      </div>
      <div className="flex-1 pt-1">
        {!isUser && (venueContext?.source === 'scraped' || eventContext?.source === 'scraped' || culturalContext) && (
          <div className="flex flex-col gap-2 mb-3">
            {venueContext?.source === 'scraped' && (
              <div className="flex items-start gap-2 rounded-lg bg-accent/50 border border-border px-3 py-2 text-sm">
                <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-foreground">
                  <span className="font-medium">{venueContext.venue_name}</span>
                  {venueContext.dress_code && venueContext.dress_code !== 'none_specified' && (
                    <span className="text-muted-foreground"> — {venueContext.dress_code_details || venueContext.dress_code}{venueContext.atmosphere ? `, ${venueContext.atmosphere.toLowerCase()}` : ''}</span>
                  )}
                </span>
              </div>
            )}
            {eventContext?.source === 'scraped' && (
              <div className="flex items-start gap-2 rounded-lg bg-accent/50 border border-border px-3 py-2 text-sm">
                <Ticket className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-foreground">
                  <span className="font-medium">{eventContext.event_name}</span>
                  <span className="text-muted-foreground"> — {
                    eventContext.dress_code && eventContext.dress_code !== 'none_specified'
                      ? (eventContext.dress_code_details || eventContext.dress_code)
                      : eventContext.style_guidance
                        ? eventContext.style_guidance
                        : eventContext.indoor_outdoor && eventContext.indoor_outdoor !== 'unknown'
                          ? `${eventContext.indoor_outdoor} event${eventContext.time_of_day && eventContext.time_of_day !== 'unknown' ? `, ${eventContext.time_of_day}` : ''}`
                          : 'Event details found'
                  }</span>
                </span>
              </div>
            )}
            {culturalContext && (
              <div className="flex items-start gap-2 rounded-lg bg-accent/50 border border-border px-3 py-2 text-sm">
                <Globe className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-foreground">
                  <span className="font-medium">{culturalContext.country}</span>
                  <span className="text-muted-foreground"> — {
                    (() => {
                      const modesty = culturalContext.norms.find(n => n.context_type === 'general_modesty');
                      const religious = culturalContext.norms.find(n => n.context_type === 'religious_sites');
                      const avoid = culturalContext.norms.find(n => n.context_type === 'items_to_avoid');
                      const note = modesty || religious || avoid;
                      if (!note) return 'Cultural dress guidance applied';
                      const text = note.guidance.replace(/[#*_\[\]]/g, '').trim();
                      const firstSentence = text.split(/[.!?\n]/).find(s => s.trim().length > 15);
                      if (!firstSentence) return 'Cultural dress guidance applied';
                      const trimmed = firstSentence.trim();
                      if (trimmed.length <= 120) return trimmed;
                      const truncated = trimmed.slice(0, 120);
                      return truncated.slice(0, truncated.lastIndexOf(' ')) + '...';
                    })()
                  }</span>
                </span>
              </div>
            )}
          </div>
        )}
        {!isUser && weatherNote && (
          <p className="text-sm text-muted-foreground mb-2">{weatherNote}</p>
        )}
        {!isUser && recommendation && renderWardrobeBanner()}
        <p className="text-foreground whitespace-pre-wrap">{content}</p>
        {cityClarificationChips && cityClarificationChips.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {cityClarificationChips.map((city) => (
              <button
                key={city}
                onClick={() => onCitySelect?.(city)}
                className="px-3 py-1.5 text-sm border border-border rounded-full text-foreground hover:bg-primary/10 hover:border-primary/30 transition-colors"
              >
                {city}
              </button>
            ))}
          </div>
        )}
        {/* Emotional tone cards for vague occasions */}
        {emotionalToneCards && onSelectTone && (
          <EmotionalToneCards
            tones={emotionalToneCards}
            onSelectTone={onSelectTone}
            selectedToneId={selectedToneId}
          />
        )}
        {/* Tone-specific recommendation when a tone is selected */}
        {emotionalToneCards && selectedToneId && toneRecommendations?.[selectedToneId] && (
          <div className="mt-4 p-4 rounded-lg bg-accent/30 border border-border">
            <p className="text-sm font-medium text-foreground mb-2">
              {emotionalToneCards.find(t => t.id === selectedToneId)?.emoji} {emotionalToneCards.find(t => t.id === selectedToneId)?.label} look:
            </p>
            <p className="text-sm text-foreground">
              {toneRecommendations[selectedToneId]?.description}
            </p>
          </div>
        )}
        {/* Quick refinement buttons - shown after recommendations */}
        {!isUser && recommendation && !emotionalToneCards && (
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={() => onCitySelect?.("Make it more formal")}
              className="px-3 py-1.5 text-xs border border-border rounded-full text-foreground hover:bg-primary/10 hover:border-primary/30 transition-colors"
            >
              More formal
            </button>
            <button
              onClick={() => onCitySelect?.("Different colors")}
              className="px-3 py-1.5 text-xs border border-border rounded-full text-foreground hover:bg-primary/10 hover:border-primary/30 transition-colors"
            >
              Different colors
            </button>
            <button
              onClick={() => onCitySelect?.("More affordable")}
              className="px-3 py-1.5 text-xs border border-border rounded-full text-foreground hover:bg-primary/10 hover:border-primary/30 transition-colors"
            >
              More affordable
            </button>
            <button
              onClick={() => onCitySelect?.("Try something edgier")}
              className="px-3 py-1.5 text-xs border border-border rounded-full text-foreground hover:bg-primary/10 hover:border-primary/30 transition-colors"
            >
              Edgier
            </button>
          </div>
        )}
        {renderRecommendation()}
        {/* Guest sign-up nudge */}
        {!isUser && isFirstGuestResponse && !wardrobeStatus?.is_authenticated && (
          <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20 flex items-start justify-between gap-3">
            <p className="text-sm text-foreground">
              ✨ Sign up to get recommendations from your own wardrobe and save your style preferences.
            </p>
            <div className="flex gap-2 flex-shrink-0">
              <Link
                to="/auth"
                className="text-sm font-medium text-primary hover:underline"
              >
                Sign up
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
