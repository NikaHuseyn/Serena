import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeadersFor } from "../_shared/cors.ts";

interface SearchRequest {
  query: string;
  budget_tier?: 'budget' | 'mid' | 'luxury';
  regions?: string[];
  max_results?: number;
}

interface SerperProduct {
  title?: string;
  price?: string;
  source?: string;
  link?: string;
  imageUrl?: string;
  rating?: number;
  position?: number;
}

interface ProductResult {
  title: string;
  price: number | null;
  currency: string;
  source: string;
  link: string;
  imageUrl: string | null;
  rating: number | null;
  position: number;
}

const regionConfig: Record<string, { gl: string; hl: string; currencySymbol: string; currency: string }> = {
  uk: { gl: 'gb', hl: 'en', currencySymbol: '£', currency: 'GBP' },
  us: { gl: 'us', hl: 'en', currencySymbol: '$', currency: 'USD' },
  eu: { gl: 'de', hl: 'en', currencySymbol: '€', currency: 'EUR' },
};

const budgetRanges: Record<string, { min: number; max: number }> = {
  budget: { min: 0, max: 50 },
  mid: { min: 50, max: 200 },
  luxury: { min: 200, max: Infinity },
};

function parsePrice(priceStr?: string): number | null {
  if (!priceStr) return null;
  const cleaned = priceStr.replace(/[^0-9.,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function detectCurrency(priceStr?: string, fallback = 'GBP'): string {
  if (!priceStr) return fallback;
  if (priceStr.includes('£')) return 'GBP';
  if (priceStr.includes('$')) return 'USD';
  if (priceStr.includes('€')) return 'EUR';
  return fallback;
}

async function searchSerper(
  query: string,
  gl: string,
  hl: string,
  num: number,
  apiKey: string
): Promise<SerperProduct[]> {
  const res = await fetch('https://google.serper.dev/shopping', {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, gl, hl, num }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Serper API error (${res.status}):`, errText);
    throw new Error(`Serper API returned ${res.status}`);
  }

  const data = await res.json();
  return data.shopping || [];
}

function filterByBudget(products: ProductResult[], tier?: string): ProductResult[] {
  if (!tier || !budgetRanges[tier]) return products;
  const { min, max } = budgetRanges[tier];
  return products.filter(p => {
    if (p.price === null) return true; // include items with unknown price
    return p.price >= min && p.price < max;
  });
}

async function checkIpRateLimit(req: Request, dailyLimit = 60): Promise<boolean> {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return true;
    const res = await fetch(`${url}/rest/v1/rpc/check_guest_rate_limit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ ip_param: ip, daily_limit: dailyLimit }),
    });
    const data = await res.json().catch(() => ({}));
    return data?.allowed !== false;
  } catch { return true; }
}

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!(await checkIpRateLimit(req, 60))) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const apiKey = Deno.env.get('SERPER_API_KEY');
    if (!apiKey) {
      throw new Error('SERPER_API_KEY not configured');
    }

    const body: SearchRequest = await req.json();
    const { query, budget_tier, max_results = 6 } = body;
    const regions = body.regions?.length ? body.regions : ['uk'];

    if (!query) {
      return new Response(JSON.stringify({ error: 'query is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Search each region in parallel
    const regionResults = await Promise.all(
      regions.map(async (region) => {
        const config = regionConfig[region] || regionConfig.uk;
        const rawProducts = await searchSerper(query, config.gl, config.hl, max_results * 2, apiKey);

        const mapped: ProductResult[] = rawProducts.map((p, i) => ({
          title: p.title || 'Unknown Product',
          price: parsePrice(p.price),
          currency: detectCurrency(p.price, config.currency),
          source: p.source || 'Unknown Retailer',
          link: p.link || '',
          imageUrl: p.imageUrl || null,
          rating: p.rating || null,
          position: p.position || i + 1,
        }));

        const filtered = filterByBudget(mapped, budget_tier).slice(0, max_results);

        return {
          results: filtered,
          query,
          region,
          budget_tier: budget_tier || 'all',
          total: filtered.length,
        };
      })
    );

    // If single region, return flat; otherwise return array
    const response = regions.length === 1 ? regionResults[0] : regionResults;

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('search-products error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
