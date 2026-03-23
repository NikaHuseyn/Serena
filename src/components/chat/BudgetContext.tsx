import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';

export type CurrencyRegion = 'uk' | 'us' | 'eu';

export interface CurrencyConfig {
  symbol: string;
  region: CurrencyRegion;
}

const CURRENCY_MAP: Record<CurrencyRegion, CurrencyConfig> = {
  uk: { symbol: '£', region: 'uk' },
  us: { symbol: '$', region: 'us' },
  eu: { symbol: '€', region: 'eu' },
};

export interface BudgetChipDef {
  label: string;
  value: number | null;
  noLimit: boolean;
}

function getChipsForRegion(region: CurrencyRegion): BudgetChipDef[] {
  const s = CURRENCY_MAP[region].symbol;
  return [
    { label: `Under ${s}50`, value: 50, noLimit: false },
    { label: `${s}50–${s}150`, value: 150, noLimit: false },
    { label: `${s}150–${s}500`, value: 500, noLimit: false },
    { label: `${s}500+`, value: null, noLimit: true },
    { label: 'No limit ✨', value: null, noLimit: true },
  ];
}

interface BudgetState {
  maxBudget: number | null;
  noLimit: boolean;
}

interface BudgetContextType {
  budget: BudgetState;
  currency: CurrencyConfig;
  chips: BudgetChipDef[];
  setBudgetFromInput: (value: number | null) => void;
  setNoLimit: (noLimit: boolean) => void;
  setBudgetFromChip: (chip: string) => void;
}

const BudgetContext = createContext<BudgetContextType | null>(null);

function detectRegion(): CurrencyRegion {
  try {
    const saved = localStorage.getItem('cyl-region');
    if (saved === 'uk' || saved === 'us' || saved === 'eu') return saved;
  } catch {}

  try {
    const locale = navigator.language || '';
    const lower = locale.toLowerCase();
    if (lower.startsWith('en-us')) return 'us';
    if (lower.startsWith('en-gb') || lower.startsWith('en-ie')) return 'uk';
    const euLangs = ['de', 'fr', 'es', 'it', 'nl', 'pt', 'pl', 'sv', 'da', 'fi', 'el', 'cs', 'ro', 'hu', 'bg', 'hr', 'sk', 'sl', 'lt', 'lv', 'et'];
    const langPart = lower.split('-')[0];
    if (euLangs.includes(langPart)) return 'eu';
  } catch {}

  return 'uk';
}

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
  const [region] = useState<CurrencyRegion>(detectRegion);

  const currency = useMemo(() => CURRENCY_MAP[region], [region]);
  const chips = useMemo(() => getChipsForRegion(region), [region]);

  useEffect(() => {
    try { localStorage.setItem('cyl-region', region); } catch {}
  }, [region]);

  const setBudgetFromInput = useCallback((value: number | null) => {
    setBudget(prev => ({ ...prev, maxBudget: value, noLimit: false }));
    try {
      if (value !== null) {
        localStorage.setItem('cyl-max-budget', String(value));
      } else {
        localStorage.removeItem('cyl-max-budget');
      }
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

  const setBudgetFromChip = useCallback((chipLabel: string) => {
    const match = chips.find(c => c.label === chipLabel);
    if (!match) return;
    setBudget({ maxBudget: match.value, noLimit: match.noLimit });
    try {
      if (match.noLimit) {
        localStorage.setItem('cyl-no-limit', 'true');
        localStorage.removeItem('cyl-max-budget');
      } else if (match.value !== null) {
        localStorage.setItem('cyl-max-budget', String(match.value));
        localStorage.removeItem('cyl-no-limit');
      }
    } catch {}
  }, [chips]);

  return (
    <BudgetContext.Provider value={{ budget, currency, chips, setBudgetFromInput, setNoLimit, setBudgetFromChip }}>
      {children}
    </BudgetContext.Provider>
  );
};

export const useBudget = () => {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error('useBudget must be used within BudgetProvider');
  return ctx;
};
