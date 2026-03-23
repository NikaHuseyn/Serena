import React, { useState } from 'react';
import { useBudget } from './BudgetContext';

interface BudgetChipsProps {
  onSelect: (chip: string) => void;
}

const BudgetChips = ({ onSelect }: BudgetChipsProps) => {
  const { chips, setBudgetFromChip } = useBudget();
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = (label: string) => {
    setSelected(label);
    setBudgetFromChip(label);
    onSelect(label);
  };

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {chips.map((chip) => (
        <button
          key={chip.label}
          onClick={() => handleSelect(chip.label)}
          disabled={selected !== null}
          className={`px-3 py-1.5 text-sm border rounded-full transition-colors ${
            selected === chip.label
              ? 'border-primary bg-primary/10 text-primary font-medium'
              : selected !== null
                ? 'border-border/50 text-muted-foreground/50 cursor-default'
                : 'border-border text-foreground hover:bg-primary/10 hover:border-primary/30'
          }`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
};

export default BudgetChips;
