import React from 'react';

interface EmotionalTone {
  id: string;
  emoji: string;
  label: string;
  description: string;
}

interface EmotionalToneCardsProps {
  tones: EmotionalTone[];
  onSelectTone: (toneId: string) => void;
  selectedToneId?: string | null;
}

const EmotionalToneCards = ({ tones, onSelectTone, selectedToneId }: EmotionalToneCardsProps) => {
  return (
    <div className="mt-4">
      <p className="text-sm text-muted-foreground mb-2">Want a different vibe? Tap to restyle:</p>
      <div className="grid grid-cols-2 gap-2">
        {tones.map((tone) => {
          const isSelected = selectedToneId === tone.id;
          return (
            <button
              key={tone.id}
              onClick={() => onSelectTone(tone.id)}
              className={`text-left rounded-xl border p-3 transition-all ${
                isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border hover:border-primary/40 hover:bg-muted/30'
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
    </div>
  );
};

export default EmotionalToneCards;