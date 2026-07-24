import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TOP_30_COUNTRIES = [
  'France', 'Spain', 'United States', 'China', 'Italy',
  'Turkey', 'Mexico', 'Thailand', 'Germany', 'United Kingdom',
  'Austria', 'Malaysia', 'Greece', 'Japan', 'Portugal',
  'Canada', 'Poland', 'Netherlands', 'United Arab Emirates', 'India',
  'Croatia', 'Saudi Arabia', 'South Korea', 'Hungary', 'Czech Republic',
  'Morocco', 'Indonesia', 'Egypt', 'Singapore', 'Vietnam'
];

const CONTEXT_TYPES = [
  'general_modesty',
  'religious_sites',
  'business_dress',
  'nightlife_restaurant',
  'items_to_avoid',
  'seasonal_considerations'
];

// Country slug helpers
function commisceoSlug(country: string): string {
  return country.toLowerCase().replace(/\s+/g, '-');
}

function lonelyPlanetSlug(country: string): string {
  return country.toLowerCase().replace(/\s+/g, '-');
}

function stateDeptSlug(country: string): string {
  return country.toLowerCase().replace(/\s+/g, '-');
}

interface ScrapedGuidance {
  country: string;
  context_type: string;
  guidance: string;
  source_url: string;
}

async function scrapeWithFirecrawl(url: string, apiKey: string): Promise<string | null> {
  try {
    console.log(`Scraping: ${url}`);
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 2000,
      }),
    });

    if (!response.ok) {
      console.warn(`Scrape failed for ${url}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data?.data?.markdown || data?.markdown || null;
  } catch (err) {
    console.warn(`Scrape error for ${url}:`, err);
    return null;
  }
}

function extractGuidanceFromMarkdown(markdown: string, country: string, sourceUrl: string): ScrapedGuidance[] {
  const results: ScrapedGuidance[] = [];
  const lower = markdown.toLowerCase();

  // General modesty
  const modestyKeywords = ['modest', 'modesty', 'cover', 'conservative dress', 'bare shoulder', 'short skirt', 'revealing', 'dress code', 'clothing etiquette', 'what to wear'];
  const modestyParagraphs = extractRelevantParagraphs(markdown, modestyKeywords);
  if (modestyParagraphs) {
    results.push({ country, context_type: 'general_modesty', guidance: modestyParagraphs, source_url: sourceUrl });
  }

  // Religious sites
  const religiousKeywords = ['temple', 'mosque', 'church', 'shrine', 'religious site', 'place of worship', 'head cover', 'headscarf', 'shoes off', 'remove shoes', 'sacred', 'monastery'];
  const religiousParagraphs = extractRelevantParagraphs(markdown, religiousKeywords);
  if (religiousParagraphs) {
    results.push({ country, context_type: 'religious_sites', guidance: religiousParagraphs, source_url: sourceUrl });
  }

  // Business dress
  const businessKeywords = ['business', 'formal', 'suit', 'office', 'meeting', 'professional', 'tie', 'corporate'];
  const businessParagraphs = extractRelevantParagraphs(markdown, businessKeywords);
  if (businessParagraphs) {
    results.push({ country, context_type: 'business_dress', guidance: businessParagraphs, source_url: sourceUrl });
  }

  // Nightlife/restaurant
  const nightlifeKeywords = ['restaurant', 'nightlife', 'bar', 'club', 'dining', 'evening wear', 'smart casual', 'dress up'];
  const nightlifeParagraphs = extractRelevantParagraphs(markdown, nightlifeKeywords);
  if (nightlifeParagraphs) {
    results.push({ country, context_type: 'nightlife_restaurant', guidance: nightlifeParagraphs, source_url: sourceUrl });
  }

  // Items to avoid
  const avoidKeywords = ['avoid wearing', 'do not wear', 'inappropriate', 'offensive', 'forbidden', 'illegal', 'ban', 'prohibited', 'not allowed', 'frowned upon'];
  const avoidParagraphs = extractRelevantParagraphs(markdown, avoidKeywords);
  if (avoidParagraphs) {
    results.push({ country, context_type: 'items_to_avoid', guidance: avoidParagraphs, source_url: sourceUrl });
  }

  // Seasonal
  const seasonalKeywords = ['summer', 'winter', 'monsoon', 'rainy season', 'hot weather', 'cold weather', 'humidity', 'sun protection', 'layering', 'season'];
  const seasonalParagraphs = extractRelevantParagraphs(markdown, seasonalKeywords);
  if (seasonalParagraphs) {
    results.push({ country, context_type: 'seasonal_considerations', guidance: seasonalParagraphs, source_url: sourceUrl });
  }

  return results;
}

function extractRelevantParagraphs(markdown: string, keywords: string[]): string | null {
  const paragraphs = markdown.split(/\n\n+/);
  const relevant: string[] = [];

  for (const para of paragraphs) {
    const lower = para.toLowerCase();
    // Check if paragraph contains dress/clothing context AND at least one keyword
    const hasDressContext = /dress|cloth|wear|outfit|attire|garment|fashion/i.test(para);
    const hasKeyword = keywords.some(kw => lower.includes(kw));

    if (hasKeyword && (hasDressContext || keywords.some(kw => ['modest', 'modesty', 'temple', 'mosque', 'church', 'avoid wearing', 'do not wear', 'prohibited'].includes(kw) && lower.includes(kw)))) {
      const cleaned = para.replace(/[#*_]/g, '').trim();
      if (cleaned.length > 30 && cleaned.length < 2000) {
        relevant.push(cleaned);
      }
    }
  }

  if (relevant.length === 0) return null;
  return relevant.slice(0, 4).join('\n\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const adminSecret = Deno.env.get('ADMIN_INGEST_SECRET');
  if (!adminSecret || req.headers.get('x-admin-secret') !== adminSecret) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      throw new Error('FIRECRAWL_API_KEY not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse optional body for subset of countries
    let countries = TOP_30_COUNTRIES;
    try {
      const body = await req.json();
      if (body?.countries && Array.isArray(body.countries)) {
        countries = body.countries;
      }
    } catch { /* no body, use all */ }

    console.log(`Starting cultural dress norms scrape for ${countries.length} countries`);

    const allGuidance: ScrapedGuidance[] = [];
    let scrapeCount = 0;
    let errorCount = 0;

    // Process countries in batches of 5 to respect rate limits
    for (let i = 0; i < countries.length; i += 5) {
      const batch = countries.slice(i, i + 5);
      
      const batchPromises = batch.map(async (country) => {
        const countryGuidance: ScrapedGuidance[] = [];

        // Source 1: Commisceo Global
        const commisceoUrl = `https://www.commisceo-global.com/resources/country-guides/${commisceoSlug(country)}-guide`;
        const commisceoMd = await scrapeWithFirecrawl(commisceoUrl, firecrawlKey);
        if (commisceoMd) {
          scrapeCount++;
          countryGuidance.push(...extractGuidanceFromMarkdown(commisceoMd, country, commisceoUrl));
        } else {
          errorCount++;
        }

        // Source 2: Lonely Planet
        const lpUrl = `https://www.lonelyplanet.com/${lonelyPlanetSlug(country)}`;
        const lpMd = await scrapeWithFirecrawl(lpUrl, firecrawlKey);
        if (lpMd) {
          scrapeCount++;
          countryGuidance.push(...extractGuidanceFromMarkdown(lpMd, country, lpUrl));
        } else {
          errorCount++;
        }

        // Source 3: US State Dept
        const stateUrl = `https://travel.state.gov/content/travel/en/international-travel/International-Travel-Country-Information-Pages/${stateDeptSlug(country)}.html`;
        const stateMd = await scrapeWithFirecrawl(stateUrl, firecrawlKey);
        if (stateMd) {
          scrapeCount++;
          countryGuidance.push(...extractGuidanceFromMarkdown(stateMd, country, stateUrl));
        } else {
          errorCount++;
        }

        // Deduplicate by context_type - merge guidance from multiple sources
        const mergedByType = new Map<string, ScrapedGuidance>();
        for (const g of countryGuidance) {
          const existing = mergedByType.get(g.context_type);
          if (existing) {
            // Append if from different source
            if (!existing.guidance.includes(g.guidance.slice(0, 50))) {
              existing.guidance = existing.guidance + '\n\n---\n\n' + g.guidance;
              existing.source_url = existing.source_url + ', ' + g.source_url;
            }
          } else {
            mergedByType.set(g.context_type, { ...g });
          }
        }

        return Array.from(mergedByType.values());
      });

      const batchResults = await Promise.all(batchPromises);
      for (const results of batchResults) {
        allGuidance.push(...results);
      }

      // Small delay between batches
      if (i + 5 < countries.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    console.log(`Scraping complete: ${scrapeCount} pages scraped, ${errorCount} errors, ${allGuidance.length} guidance entries extracted`);

    // Upsert into database
    let insertedCount = 0;
    for (const g of allGuidance) {
      // Truncate guidance to reasonable length
      const truncatedGuidance = g.guidance.slice(0, 5000);
      
      const { error } = await supabase
        .from('cultural_dress_norms')
        .upsert({
          country: g.country,
          city: null,
          context_type: g.context_type,
          guidance: truncatedGuidance,
          source_url: g.source_url,
          last_updated: new Date().toISOString(),
        }, {
          onConflict: 'country,COALESCE(city, \'\'),context_type',
          ignoreDuplicates: false,
        });

      if (error) {
        // Fallback: try delete + insert
        await supabase
          .from('cultural_dress_norms')
          .delete()
          .eq('country', g.country)
          .is('city', null)
          .eq('context_type', g.context_type);

        const { error: insertError } = await supabase
          .from('cultural_dress_norms')
          .insert({
            country: g.country,
            city: null,
            context_type: g.context_type,
            guidance: truncatedGuidance,
            source_url: g.source_url,
            last_updated: new Date().toISOString(),
          });

        if (insertError) {
          console.error(`Failed to insert ${g.country}/${g.context_type}:`, insertError);
        } else {
          insertedCount++;
        }
      } else {
        insertedCount++;
      }
    }

    console.log(`Database updated: ${insertedCount} entries upserted`);

    return new Response(JSON.stringify({
      success: true,
      countries_processed: countries.length,
      pages_scraped: scrapeCount,
      scrape_errors: errorCount,
      guidance_entries: allGuidance.length,
      entries_saved: insertedCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Cultural dress norms scrape error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
