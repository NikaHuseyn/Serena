import React from 'react';

interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  disabled?: boolean;
}

const SuggestionChips = ({ suggestions, onSelect, disabled }: SuggestionChipsProps) => {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {suggestions.map((suggestion, index) => (
        <button
          key={index}
          onClick={() => { if (!disabled) onSelect(suggestion); }}
          disabled={disabled}
          aria-disabled={disabled}
          className="px-4 py-2 text-sm border border-border rounded-full text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
};

export default SuggestionChips;
