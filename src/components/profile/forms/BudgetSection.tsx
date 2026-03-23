
import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BudgetSectionProps {
  budgetRange: number[];
  setBudgetRange: (range: number[]) => void;
  confidenceScore: number[];
  setConfidenceScore: (score: number[]) => void;
}

const QUICK_BUDGETS = [
  { label: 'Under £50', min: 0, max: 50 },
  { label: '£50–£150', min: 50, max: 150 },
  { label: '£150–£300', min: 150, max: 300 },
  { label: '£300–£500', min: 300, max: 500 },
  { label: '£500+', min: 500, max: 2000 },
  { label: 'Any budget', min: 0, max: 5000 },
];

const BudgetSection = ({ 
  budgetRange, 
  setBudgetRange, 
}: BudgetSectionProps) => {
  const isSelected = (b: typeof QUICK_BUDGETS[0]) =>
    budgetRange[0] === b.min && budgetRange[1] === b.max;

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-semibold">Budget Range</Label>
        <p className="text-xs text-muted-foreground mt-1">
          How much do you typically spend on a single outfit?
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_BUDGETS.map((b) => (
          <button
            key={b.label}
            type="button"
            onClick={() => setBudgetRange([b.min, b.max])}
            className={cn(
              "px-4 py-2 rounded-xl border-2 transition-all duration-200 text-sm font-medium",
              isSelected(b)
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-primary/50 hover:bg-primary/5"
            )}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">Min (£)</Label>
          <Input
            type="number"
            min={0}
            max={budgetRange[1]}
            value={budgetRange[0]}
            onChange={(e) => setBudgetRange([Number(e.target.value), budgetRange[1]])}
            className="mt-1"
          />
        </div>
        <span className="text-muted-foreground pt-5">–</span>
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">Max (£)</Label>
          <Input
            type="number"
            min={budgetRange[0]}
            max={10000}
            value={budgetRange[1]}
            onChange={(e) => setBudgetRange([budgetRange[0], Number(e.target.value)])}
            className="mt-1"
          />
        </div>
      </div>
    </div>
  );
};

export default BudgetSection;
