import React, { createContext, useContext, useState, useCallback } from 'react';

interface BudgetState {
  maxBudget: number | null;
  noLimit: boolean;
}

interface BudgetContextType {
  budget: BudgetState;
  setBudgetFromSlider: (value: number) => void;
  setNoLimit: (noLimit: boolean) => void;
  setBudgetFromChip: (chip: string) => void;
}

const BudgetContext = createContext<BudgetContextType | null>(null);

const CHIP_MAP: Record<string, { value: number | null; noLimit: boolean }> = {
  'Under £50': { value: 50, noLimit: false },
  '£50–£150': { value: 150, noLimit: false },
  '£150–£500': { value: 500, noLimit: false },
  'No limit': { value: null, noLimit: true },
};

function loadSaved(): BudgetState {
  try {
    const noLimit = localStorage.getItem('cyl-no-limit') === 'true';
    const v = localStorage.getItem('cyl-max-budget');
    return { maxBudget: v ? parseInt(v, 10) : null, noLimit };
  } catch {
    return { maxBudget: null, noLimit: false };
  }
}

export const BudgetProvider = ({ children }: { children: React.ReactNode }) => {
  const [budget, setBudget] = useState<BudgetState>(loadSaved);

  const setBudgetFromSlider = useCallback((value: number) => {
    setBudget(prev => ({ ...prev, maxBudget: value, noLimit: false }));
    try {
      localStorage.setItem('cyl-max-budget', String(value));
      localStorage.removeItem('cyl-no-limit');
    } catch {}
  }, []);

  const setNoLimit = useCallback((noLimit: boolean) => {
    setBudget(prev => ({ ...prev, noLimit }));
    try {
      if (noLimit) {
        localStorage.setItem('cyl-no-limit', 'true');
      } else {
        localStorage.removeItem('cyl-no-limit');
      }
    } catch {}
  }, []);

  const setBudgetFromChip = useCallback((chip: string) => {
    const mapping = CHIP_MAP[chip];
    if (!mapping) return;
    setBudget({ maxBudget: mapping.value, noLimit: mapping.noLimit });
    try {
      if (mapping.noLimit) {
        localStorage.setItem('cyl-no-limit', 'true');
        localStorage.removeItem('cyl-max-budget');
      } else if (mapping.value !== null) {
        localStorage.setItem('cyl-max-budget', String(mapping.value));
        localStorage.removeItem('cyl-no-limit');
      }
    } catch {}
  }, []);

  return (
    <BudgetContext.Provider value={{ budget, setBudgetFromSlider, setNoLimit, setBudgetFromChip }}>
      {children}
    </BudgetContext.Provider>
  );
};

export const useBudget = () => {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error('useBudget must be used within BudgetProvider');
  return ctx;
};

export const BUDGET_CHIPS = Object.keys(CHIP_MAP);
