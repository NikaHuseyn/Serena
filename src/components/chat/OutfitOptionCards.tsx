import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Shirt,
  ChevronDown,
  ChevronUp,
  Loader2,
  ExternalLink,
  ShoppingBag,
  Sparkles,
  Pin,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ProductResult {
  retailer?: string;
  platform?: string;
  product_name?: string;
  price?: string | null;
  product_url?: string;
  image_url?: string | null;
  source?: string;
  type?: string;
}

interface OutfitItem {
  category?: string;
  name: string;
  source?: string;
  wardrobe_item_id?: string | null;
  reasoning?: string;
  styling_tips?: string;
  versatility_note?: string | null;
  rental_market_likely?: boolean;
  price_tier?: string;
  buy?: ProductResult[];
  rent?: ProductResult[];
}

interface OutfitOption {
  option_label: string;
  is_primary?: boolean;
  items: OutfitItem[];
}

interface OutfitOptionCardsProps {
  options: OutfitOption[];
  mode?: 'wardrobe_only' | 'shop_new';
  rentalPreference?: string;
  stylingCategory?: string;
  /** Active "Style this" anchor (wardrobe item id). When set, the matching
   *  wardrobe item in each option gets a distinct "Your piece" badge so
   *  it's obvious which piece the look is built around. */
  anchorItemId?: string | null;
  onSelect: (message: string) => void;
}

const isUsableProduct = (product: ProductResult) => {
  const url = product.product_url || '';
  return (
    /^https?:\/\//.test(url) &&
    !url.includes('google.com/search') &&
    !url.includes('google.co.uk/search') &&
    !url.includes('google.com/shopping') &&
    !url.includes('google.co.uk/shopping')
  );
};

const usableProducts = (products?: ProductResult[]) => (products || []).filter(isUsableProduct);

// -----------------------------------------------------------------------
// Small building blocks
// -----------------------------------------------------------------------
const ProductCard = ({
  product,
  label,
}: {
  product: ProductResult;
  label: 'Buy' | 'Rent';
}) => {
  const retailer = product.retailer || product.platform || 'Retailer';
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!product.image_url && !imageFailed;
  return (
    <a
      href={product.product_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col rounded-lg border border-border bg-background overflow-hidden hover:border-primary/40 transition-colors"
    >
      <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
        {showImage ? (
          <img
            src={product.image_url!}
            alt={product.product_name || retailer}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <ShoppingBag className="h-8 w-8 text-muted-foreground/40" />
        )}
      </div>
      <div className="p-2 flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
            {label}
          </span>
          <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <p className="text-xs font-medium text-foreground truncate">{retailer}</p>
        <p className="text-[11px] text-muted-foreground line-clamp-2 min-h-[2rem]">
          {product.product_name || 'View product'}
        </p>
        <p className="text-sm font-semibold text-foreground">
          {product.price || 'View'}
        </p>
      </div>
    </a>
  );
};

const ItemProducts = ({ item }: { item: OutfitItem }) => {
  const buy = usableProducts(item.buy).slice(0, 4);
  const rent = usableProducts(item.rent).slice(0, 2);
  const showRentFallback =
    item.rental_market_likely === true &&
    rent.length === 0 &&
    item.source !== 'from_wardrobe';
  const rentalQuery = encodeURIComponent(item.name || '');
  if (buy.length === 0 && rent.length === 0 && !showRentFallback) return null;

  return (
    <div className="mt-3 space-y-2">
      {buy.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            Buy · {buy.length} option{buy.length === 1 ? '' : 's'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {buy.map((p, i) => (
              <ProductCard key={`buy-${i}`} product={p} label="Buy" />
            ))}
          </div>
        </div>
      )}
      {rent.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            Rent · {rent.length} option{rent.length === 1 ? '' : 's'}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:max-w-[50%]">
            {rent.map((p, i) => (
              <ProductCard key={`rent-${i}`} product={p} label="Rent" />
            ))}
          </div>
        </div>
      )}
      {showRentFallback && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <a
            href={`https://www.hurr.com/search?query=${rentalQuery}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline underline-offset-2"
          >
            Search rentals on HURR →
          </a>
          <a
            href={`https://byrotation.com/search?q=${rentalQuery}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline underline-offset-2"
          >
            By Rotation →
          </a>
        </div>
      )}
    </div>
  );
};

const OutfitItemRow = ({ item, anchorItemId }: { item: OutfitItem; anchorItemId?: string | null }) => {
  const [expanded, setExpanded] = useState(false);
  const isFromWardrobe = item.source === 'from_wardrobe';
  // An anchor item is always a from_wardrobe piece whose id matches the
  // pinned anchor for this conversation.
  const isAnchor =
    isFromWardrobe &&
    !!anchorItemId &&
    String(item.wardrobe_item_id ?? '') === String(anchorItemId);
  const hasReasoning = !!item.reasoning?.trim();

  return (
    <div className="py-3 border-b border-border last:border-b-0">
      {/* Single heading — one concept, buy + rent shown together below */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center flex-wrap gap-2">
            <p className="text-sm font-medium text-foreground">{item.name}</p>
            {isAnchor ? (
              <Badge
                variant="secondary"
                className="text-[10px] h-5 gap-1 bg-primary/15 text-primary border-primary/30"
                title="This is the piece the look is built around"
              >
                <Pin className="h-3 w-3" />
                Your piece
              </Badge>
            ) : isFromWardrobe ? (
              <Badge
                variant="secondary"
                className="text-[10px] h-5 gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
              >
                <Shirt className="h-3 w-3" />
                From your wardrobe
              </Badge>
            ) : null}
          </div>
          {item.versatility_note && (
            <p className="text-[11px] text-muted-foreground italic mt-0.5">
              {item.versatility_note}
            </p>
          )}
        </div>
        {hasReasoning && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex-shrink-0 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide reasoning' : 'Show reasoning'}
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {expanded && hasReasoning && (
        <div className="mt-2 space-y-1.5">
          <p className="text-sm text-muted-foreground">{item.reasoning}</p>
          {item.styling_tips && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Styling tip:</span>{' '}
              {item.styling_tips}
            </p>
          )}
        </div>
      )}

      <ItemProducts item={item} />
    </div>
  );
};

// -----------------------------------------------------------------------
// Option card
// -----------------------------------------------------------------------
const OptionCard = ({
  option,
  rentalPreference,
  stylingCategory,
  anchorItemId,
  onSelect,
}: {
  option: OutfitOption;
  rentalPreference?: string;
  stylingCategory?: string;
  anchorItemId?: string | null;
  onSelect: (message: string) => void;
}) => {
  const [items, setItems] = useState<OutfitItem[]>(option.items || []);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // "Has product results" means at least one non-wardrobe item already carries
  // buy/rent arrays. Primary options in shop_new mode come pre-populated by
  // the edge function.
  const hasProductResults = items.some(
    (it) => it.source !== 'from_wardrobe' && (usableProducts(it.buy).length + usableProducts(it.rent).length > 0),
  );
  const hasSearchable = items.some((it) => it.source !== 'from_wardrobe');

  const loadProducts = async () => {
    setSearching(true);
    setSearchError(null);
    try {
      const nonWardrobe = items.filter((it) => it.source !== 'from_wardrobe');
      const { data, error } = await supabase.functions.invoke('oracle-styling', {
        body: {
          action: 'search_option',
          option_label: option.option_label,
          items_to_search: nonWardrobe,
          rental_preference: rentalPreference,
          styling_category: stylingCategory,
        },
      });
      if (error) throw error;
      const searched: OutfitItem[] = data?.items || [];
      const byName = new Map(searched.map((s) => [s.name, s]));
      setItems((prev) =>
        prev.map((it) => {
          if (it.source === 'from_wardrobe') return it;
          const found = byName.get(it.name);
          return found ? { ...it, buy: found.buy, rent: found.rent } : it;
        }),
      );
    } catch (err: any) {
      console.warn('search_option failed:', err);
      setSearchError('Could not load prices right now. Try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = async () => {
    // Send the visible chat message immediately.
    onSelect(`Let's go with: ${option.option_label}`);

    // Background: record selection for authenticated users (fail silently).
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      supabase.functions
        .invoke('oracle-styling', {
          body: {
            action: 'record_selection',
            option_label: option.option_label,
            option_traits: {
              is_primary: !!option.is_primary,
              item_names: (option.items || []).map((i) => i.name),
            },
            conversation_hint: option.option_label,
          },
        })
        .catch(() => { /* fail silently */ });
    } catch { /* fail silently */ }
  };

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {option.is_primary && (
            <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          )}
          <p className="text-sm font-semibold text-foreground truncate">
            {option.option_label}
          </p>
        </div>
      </div>

      <div className="px-4">
        {items.map((item, idx) => (
          <OutfitItemRow key={`${item.name}-${idx}`} item={item} anchorItemId={anchorItemId} />
        ))}
      </div>

      <div className="px-4 py-3 border-t border-border flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        {!hasProductResults && hasSearchable ? (
          <Button
            variant="outline"
            size="sm"
            onClick={loadProducts}
            disabled={searching}
            className="w-full sm:w-auto"
          >
            {searching ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                Finding prices…
              </>
            ) : (
              'See buy & rent options'
            )}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            {hasProductResults ? 'Buy & rent prices below' : 'Every piece is in your wardrobe'}
          </span>
        )}
        <Button size="sm" onClick={handleSelect} className="w-full sm:w-auto">
          I'll go with this one
        </Button>
      </div>

      {searchError && (
        <p className="px-4 pb-3 text-xs text-destructive">{searchError}</p>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------
const OutfitOptionCards: React.FC<OutfitOptionCardsProps> = ({
  options,
  mode,
  rentalPreference,
  stylingCategory,
  anchorItemId,
  onSelect,
}) => {
  if (!options || options.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      {mode && (
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {mode === 'wardrobe_only' ? 'From your wardrobe' : 'Shop the look'}
        </p>
      )}
      {options.map((opt, idx) => (
        <OptionCard
          key={`${opt.option_label}-${idx}`}
          option={opt}
          rentalPreference={rentalPreference}
          stylingCategory={stylingCategory}
          anchorItemId={anchorItemId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};

export default OutfitOptionCards;
