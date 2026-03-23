import { supabase } from '@/integrations/supabase/client';

// ============================================
// TYPES
// ============================================

export type WardrobeState = 'no_wardrobe' | 'partial' | 'full_match' | 'explicit_shop';

export interface RecommendedItem {
  name: string;
  source?: string;
  reasoning?: string;
  wardrobe_item_id?: string | null;
  purchase_options?: any;
}

export interface ProductSearchResult {
  title: string;
  price: number | null;
  currency: string;
  source: string;
  link: string;
  imageUrl: string | null;
  rating: number | null;
  position: number;
}

export interface ItemSearchResult {
  item_type: string;
  style_descriptor: string;
  occasion_suitability: string;
  price_tier: string;
  retailer_results: Array<{
    retailer: string;
    product_name: string;
    price: string | null;
    product_url: string;
    image_url: string | null;
  }>;
  rental_results?: any[];
  secondhand_results?: any[];
}

// ============================================
// WARDROBE STATE DETECTION
// ============================================

const EXPLICIT_SHOP_PATTERNS = [
  /\b(find|show|get)\s+(me\s+)?(something|options?)\s+(to\s+)?(buy|purchase|shop)/i,
  /\bwhere\s+can\s+i\s+(get|buy|find|purchase)/i,
  /\bi\s+want\s+something\s+new/i,
  /\bshop\s+(this|the)\s+look/i,
  /\bbuy\s+(this|the|a|an|some)/i,
  /\bshopping\s+(options|suggestions|links)/i,
  /\bshow\s+me\s+(products|items|things)\s+to\s+buy/i,
];

export function detectExplicitShopIntent(message: string): boolean {
  return EXPLICIT_SHOP_PATTERNS.some(p => p.test(message));
}

export function determineWardrobeState(
  wardrobeStatus: { is_authenticated: boolean; wardrobe_count: number; has_wardrobe: boolean } | undefined,
  items: RecommendedItem[],
  userMessage: string,
): WardrobeState {
  // State 4 — explicit shopping request overrides everything
  if (detectExplicitShopIntent(userMessage)) return 'explicit_shop';

  // Guest or empty wardrobe → State 1
  if (!wardrobeStatus?.is_authenticated || !wardrobeStatus.has_wardrobe) return 'no_wardrobe';

  // Check how many items are from wardrobe vs need purchase
  const fromWardrobe = items.filter(i => i.source === 'from_wardrobe').length;
  const needsPurchase = items.filter(i => i.source === 'needs_purchase' || !i.source).length;

  if (fromWardrobe > 0 && needsPurchase === 0) return 'full_match';
  if (fromWardrobe > 0 && needsPurchase > 0) return 'partial';

  // All items are new → treat like no_wardrobe
  return 'no_wardrobe';
}

export function getSectionTitle(state: WardrobeState): string {
  switch (state) {
    case 'no_wardrobe':
    case 'explicit_shop':
      return 'Shop This Look';
    case 'partial':
      return 'Complete Your Look';
    case 'full_match':
      return '';
  }
}

// ============================================
// SEARCH QUERY ENRICHMENT
// ============================================

const ACCESSORY_CATEGORIES = [
  'earring', 'necklace', 'bracelet', 'ring', 'watch', 'bag', 'clutch',
  'belt', 'scarf', 'hat', 'sunglasses', 'jewellery', 'jewelry',
  'cufflinks', 'tie', 'brooch', 'hair',
];

function isAccessory(itemName: string): boolean {
  const lower = itemName.toLowerCase();
  return ACCESSORY_CATEGORIES.some(cat => lower.includes(cat));
}

function enrichSearchQuery(itemName: string, occasionContext?: string): string {
  // If the item name is very generic, add occasion context
  const lower = itemName.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;

  // Very generic items get occasion context appended
  if (wordCount <= 2 && occasionContext) {
    return `${itemName} ${occasionContext}`;
  }

  return itemName;
}

function getBudgetTierFromPrice(priceTier?: string): 'budget' | 'mid' | 'luxury' | undefined {
  if (!priceTier) return undefined;
  const lower = priceTier.toLowerCase();
  if (lower.includes('budget') || lower.includes('affordable')) return 'budget';
  if (lower.includes('luxury') || lower.includes('premium') || lower.includes('designer')) return 'luxury';
  if (lower.includes('mid') || lower.includes('moderate')) return 'mid';
  return undefined;
}

// ============================================
// PRODUCT SEARCH SERVICE
// ============================================

export async function searchProductsForItems(
  items: RecommendedItem[],
  wardrobeState: WardrobeState,
  occasionContext?: string,
  budgetTier?: string,
  region: string = 'uk',
): Promise<ItemSearchResult[]> {
  // State 3 — full wardrobe match, no search needed
  if (wardrobeState === 'full_match') return [];

  // Determine which items to search for
  let itemsToSearch: RecommendedItem[];

  if (wardrobeState === 'no_wardrobe' || wardrobeState === 'explicit_shop') {
    // Search for all items, but limit accessories if no_wardrobe
    const clothingItems = items.filter(i => !isAccessory(i.name));
    const accessoryItems = items.filter(i => isAccessory(i.name));

    if (wardrobeState === 'no_wardrobe') {
      // Include all clothing, only first 1-2 accessories
      itemsToSearch = [...clothingItems, ...accessoryItems.slice(0, 2)];
    } else {
      // Explicit shop: search everything
      itemsToSearch = items;
    }
  } else {
    // Partial wardrobe: only items NOT from wardrobe
    itemsToSearch = items.filter(i => i.source !== 'from_wardrobe');
  }

  // Cap at 5 items max for performance
  itemsToSearch = itemsToSearch.slice(0, 5);

  if (itemsToSearch.length === 0) return [];

  const resolvedBudgetTier = getBudgetTierFromPrice(budgetTier);

  // Search all items in parallel
  const results = await Promise.all(
    itemsToSearch.map(async (item): Promise<ItemSearchResult | null> => {
      try {
        const query = enrichSearchQuery(item.name, occasionContext);

        const { data, error } = await supabase.functions.invoke('search-products', {
          body: {
            query,
            budget_tier: resolvedBudgetTier,
            regions: [region],
            max_results: 4,
          },
        });

        if (error || !data?.results) {
          console.warn(`Product search failed for "${item.name}":`, error);
          return null;
        }

        const retailerResults = (data.results as ProductSearchResult[]).map(p => ({
          retailer: p.source,
          product_name: p.title,
          price: p.price != null ? `£${p.price.toFixed(2)}` : null,
          product_url: p.link,
          image_url: p.imageUrl,
        }));

        return {
          item_type: item.name,
          style_descriptor: item.reasoning || '',
          occasion_suitability: occasionContext || '',
          price_tier: resolvedBudgetTier || 'all',
          retailer_results: retailerResults,
        };
      } catch (err) {
        console.warn(`Product search error for "${item.name}":`, err);
        return null;
      }
    })
  );

  return results.filter(Boolean) as ItemSearchResult[];
}
