import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ShoppingBag, Shirt, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import CompleteYourLook from './CompleteYourLook';
import { BudgetProvider } from './BudgetContext';

interface EmotionalTone {
  id: string;
  emoji: string;
  label: string;
  description: string;
}

interface ToneRecommendation {
  recommendation: any;
  content: string;
  missing_items?: any[];
}

interface EmotionalToneCardsProps {
  tones: EmotionalTone[];
  toneRecommendations: Record<string, ToneRecommendation>;
  onSelectTone: (toneId: string) => void;
  wardrobeStatus?: {
    is_authenticated: boolean;
    wardrobe_count: number;
    has_wardrobe: boolean;
  };
}

interface OutfitItem {
  name: string;
  reasoning?: string;
  source?: string;
}

const EmotionalToneCards = ({ tones, toneRecommendations, onSelectTone, wardrobeStatus }: EmotionalToneCardsProps) => {
  const [selectedTone, setSelectedTone] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const handleSelect = (toneId: string) => {
    setSelectedTone(toneId);
    onSelectTone(toneId);
  };

  const selectedData = selectedTone ? toneRecommendations[selectedTone] : null;
  const selectedToneInfo = tones.find(t => t.id === selectedTone);

  const flattenItems = (items: Record<string, any>): OutfitItem[] => {
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

  return (
    <div className="mt-4 space-y-3">
      {/* Tone selection cards */}
      <div className="grid grid-cols-2 gap-2">
        {tones.map((tone) => {
          const isSelected = selectedTone === tone.id;
          const hasData = !!toneRecommendations[tone.id];
          return (
            <button
              key={tone.id}
              onClick={() => hasData && handleSelect(tone.id)}
              disabled={!hasData}
              className={`text-left rounded-xl border p-3 transition-all ${
                isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : hasData
                    ? 'border-border hover:border-primary/40 hover:bg-muted/30'
                    : 'border-border/50 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{tone.emoji}</span>
                <span className="text-sm font-semibold text-foreground">{tone.label}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-snug">{tone.description}</p>
            </button>
          );
        })}
      </div>

      {/* Selected tone's recommendation */}
      {selectedData && selectedToneInfo && (
        <div className="rounded-xl border border-primary/20 bg-card p-4 mt-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">{selectedToneInfo.emoji}</span>
            <h3 className="text-sm font-semibold text-foreground">{selectedToneInfo.label}</h3>
          </div>

          {/* Wardrobe banner for logged-in empty wardrobe */}
          {wardrobeStatus?.is_authenticated && !wardrobeStatus.has_wardrobe && !bannerDismissed && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-primary/5 border border-primary/20 px-4 py-2.5 mb-3">
              <p className="text-sm text-foreground">
                ✨ Add your wardrobe to get outfit suggestions from clothes you already own →{' '}
                <Link to="/wardrobe" className="font-medium text-primary hover:underline">
                  Add items
                </Link>
              </p>
              <button onClick={() => setBannerDismissed(true)} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <p className="text-foreground text-sm whitespace-pre-wrap mb-3">{selectedData.content}</p>

          {/* Outfit items */}
          {selectedData.recommendation?.recommended_items && (
            <div className="space-y-2">
              {flattenItems(selectedData.recommendation.recommended_items).map((item, idx) => (
                <div key={idx} className="pl-4 border-l-2 border-border">
                  <div className="flex items-center gap-2">
                    <p className="text-foreground font-medium text-sm">{item.name}</p>
                    {item.source === 'from_wardrobe' && (
                      <Badge variant="secondary" className="text-[10px] h-5 gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        <Shirt className="h-3 w-3" />
                        Already in your wardrobe ✓
                      </Badge>
                    )}
                    {item.source === 'needs_purchase' && (
                      <Badge variant="outline" className="text-[10px] h-5 gap-1 text-muted-foreground">
                        <ShoppingBag className="h-3 w-3" />
                        Complete your look
                      </Badge>
                    )}
                  </div>
                  {item.reasoning && (
                    <p className="text-xs text-muted-foreground mt-1">{item.reasoning}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Missing items with shopping tabs */}
          {selectedData.missing_items && selectedData.missing_items.length > 0 && (
            <CompleteYourLook missingItems={selectedData.missing_items} />
          )}
        </div>
      )}
    </div>
  );
};

export default EmotionalToneCards;
