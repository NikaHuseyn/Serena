import React, { useState, useMemo } from 'react';
import { ShoppingBag, Tag, Recycle, ExternalLink, SlidersHorizontal, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useBudget } from './BudgetContext';

interface MissingItem {
  item_type: string;
  style_descriptor: string;
  occasion_suitability: string;
  price_tier: string;
  retailer_results?: Array<{
    retailer: string;
    product_name: string;
    price: string | null;
    product_url: string;
    image_url: string | null;
  }>;
  rental_results?: Array<{
    platform: string;
    product_name: string;
    price: string | null;
    product_url: string;
    image_url: string | null;
    type?: string;
  }>;
  secondhand_results?: Array<{
    platform: string;
    product_name: string;
    price: string | null;
    product_url: string;
    image_url: string | null;
    condition: string | null;
    type?: string;
  }>;
  fallback_links?: Array<{
    retailer: string;
    url: string;
  }>;
}

interface CompleteYourLookProps {
  missingItems: MissingItem[];
  title?: string;
}

type TabType = 'buy' | 'rent' | 'secondhand';

const parsePrice = (price: string | null): number | null => {
  if (!price) return null;
  const match = price.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
};

const isWithinBudget = (price: string | null, maxBudget: number | null, noLimit: boolean): boolean => {
  if (noLimit || maxBudget === null) return true;
  const parsed = parsePrice(price);
  if (parsed === null) return true;
  return parsed <= maxBudget;
};

const ProductCard = ({ product, priceLabel, subtitle }: {
  product: { product_name: string; price: string | null; product_url: string; image_url: string | null };
  priceLabel?: string;
  subtitle: string;
}) => (
  <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background p-2.5">
    {product.image_url && (
      <img
        src={product.image_url}
        alt=""
        className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-muted"
      />
    )}
    <div className="flex-1 min-w-0">
      <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug">
        {product.product_name}
      </p>
      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-[11px] text-muted-foreground">{subtitle}</span>
        {(priceLabel || product.price) && (
          <span className="text-xs font-semibold text-foreground">{priceLabel || product.price}</span>
        )}
      </div>
    </div>
    <Button variant="outline" size="sm" className="h-7 text-xs flex-shrink-0" asChild>
      <a href={product.product_url} target="_blank" rel="noopener noreferrer">
        View
        <ExternalLink className="h-3 w-3 ml-1" />
      </a>
    </Button>
  </div>
);

const MissingItemCard = ({ item, savedTab, maxBudget, noLimit }: { item: MissingItem; savedTab: TabType; maxBudget: number | null; noLimit: boolean }) => {
  const filteredRetailer = useMemo(() =>
    item.retailer_results?.filter(r => isWithinBudget(r.price, maxBudget, noLimit)) || [],
    [item.retailer_results, maxBudget, noLimit]
  );
  const filteredRental = useMemo(() =>
    item.rental_results?.filter(r => isWithinBudget(r.price, maxBudget, noLimit)) || [],
    [item.rental_results, maxBudget, noLimit]
  );
  const filteredSecondhand = useMemo(() =>
    item.secondhand_results?.filter(r => isWithinBudget(r.price, maxBudget, noLimit)) || [],
    [item.secondhand_results, maxBudget, noLimit]
  );

  const hasBuy = filteredRetailer.length > 0;
  const hasRent = filteredRental.length > 0;
  const hasSecondhand = filteredSecondhand.length > 0;

  const tabs: { key: TabType; label: string; icon: React.ReactNode; available: boolean; badge?: string }[] = [
    { key: 'buy', label: 'Buy New', icon: <ShoppingBag className="h-3 w-3" />, available: hasBuy },
    { key: 'rent', label: 'Rent', icon: <Tag className="h-3 w-3" />, available: hasRent, badge: '♻️' },
    { key: 'secondhand', label: 'Secondhand', icon: <Recycle className="h-3 w-3" />, available: hasSecondhand, badge: '♻️' },
  ];
  const availableTabs = tabs.filter(t => t.available);
  const defaultTab = availableTabs.find(t => t.key === savedTab)?.key || availableTabs[0]?.key || 'buy';
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);

  if (availableTabs.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <h4 className="text-sm font-semibold text-foreground">{item.item_type}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          {item.style_descriptor} · {item.occasion_suitability}
        </p>
      </div>

      {availableTabs.length > 1 && (
        <div className="flex border-b border-border mx-4">
          {availableTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                try { localStorage.setItem('cyl-tab-pref', tab.key); } catch {}
              }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.badge && <span className="text-[10px] leading-none">{tab.badge}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="p-3 space-y-2">
        {activeTab === 'buy' && hasBuy && filteredRetailer.map((product, idx) => (
          <ProductCard key={idx} product={product} subtitle={product.retailer} />
        ))}

        {activeTab === 'rent' && hasRent && filteredRental.map((rental, idx) => (
          <ProductCard key={idx} product={rental} subtitle={rental.platform} />
        ))}

        {activeTab === 'secondhand' && hasSecondhand && filteredSecondhand.map((sh, idx) => (
          <div key={idx}>
            <ProductCard product={sh} subtitle={sh.platform} />
            {sh.condition && (
              <Badge variant="secondary" className="ml-[60px] mt-1 text-[10px] h-4">
                Condition: {sh.condition}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const CompleteYourLook = ({ missingItems, title = 'Complete Your Look' }: CompleteYourLookProps) => {
  const { budget, setBudgetFromSlider, setNoLimit } = useBudget();
  const { maxBudget, noLimit } = budget;

  const savedTab = (() => {
    try { return (localStorage.getItem('cyl-tab-pref') as TabType) || 'buy'; } catch { return 'buy' as TabType; }
  })();

  const [showFilter, setShowFilter] = useState(maxBudget !== null || noLimit);

  const itemsWithResults = missingItems.filter(
    (m) =>
      (m.retailer_results?.length || 0) > 0 ||
      (m.rental_results?.length || 0) > 0 ||
      (m.secondhand_results?.length || 0) > 0
  );

  if (itemsWithResults.length === 0) return null;

  return (
    <div className="mt-5 pt-5 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <Button
          variant={showFilter ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => {
            const next = !showFilter;
            setShowFilter(next);
            if (!next) {
              setBudgetFromSlider(500);
              setNoLimit(false);
              try {
                localStorage.removeItem('cyl-max-budget');
                localStorage.removeItem('cyl-no-limit');
              } catch {}
            }
          }}
        >
          <SlidersHorizontal className="h-3 w-3" />
          Budget
        </Button>
      </div>

      {showFilter && (
        <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3">
          {/* No limit toggle */}
          <div className="flex items-center justify-between mb-3">
            <Label htmlFor="no-limit-toggle" className="text-xs font-medium text-muted-foreground cursor-pointer">
              No limit
            </Label>
            <Switch
              id="no-limit-toggle"
              checked={noLimit}
              onCheckedChange={(checked) => setNoLimit(checked)}
            />
          </div>

          {/* Slider */}
          <div className={noLimit ? 'opacity-40 pointer-events-none' : ''}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Max budget</span>
              <span className="text-xs font-semibold text-foreground">
                {maxBudget !== null ? `£${maxBudget}` : '£500'}
              </span>
            </div>
            <Slider
              defaultValue={[maxBudget ?? 500]}
              value={[maxBudget ?? 500]}
              min={10}
              max={5000}
              step={10}
              onValueChange={([val]) => setBudgetFromSlider(val)}
              className="w-full"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">£10</span>
              <span className="text-[10px] text-muted-foreground">£5,000</span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {itemsWithResults.map((item, idx) => (
          <MissingItemCard key={idx} item={item} savedTab={savedTab} maxBudget={maxBudget} noLimit={noLimit} />
        ))}
      </div>
    </div>
  );
};

export default CompleteYourLook;
