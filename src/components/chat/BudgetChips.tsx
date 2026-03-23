import React, { useState } from 'react';
import { BUDGET_CHIPS, useBudget } from './BudgetContext';

interface BudgetChipsProps {
  onSelect: (chip: string) => void;
}

const BudgetChips = ({ onSelect }: BudgetChipsProps) => {
  const { setBudgetFromChip } = useBudget();
  const [selected, setSelected] = useState<string | null>(null);

  const handleSelect = (chip: string) => {
    setSelected(chip);
    setBudgetFromChip(chip);
    onSelect(chip);
  };

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {BUDGET_CHIPS.map((chip) => (
        <button
          key={chip}
          onClick={() => handleSelect(chip)}
          disabled={selected !== null}
          className={`px-3 py-1.5 text-sm border rounded-full transition-colors ${
            selected === chip
              ? 'border-primary bg-primary/10 text-primary font-medium'
              : selected !== null
                ? 'border-border/50 text-muted-foreground/50 cursor-default'
                : 'border-border text-foreground hover:bg-primary/10 hover:border-primary/30'
          }`}
        >
          {chip}
        </button>
      ))}
    </div>
  );
};

export default BudgetChips;
