import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1/scrape'
const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev'

const SCRAPE_URLS = [
  // Fashion editorials
  { url: 'https://www.vogue.com/fashion', label: 'Vogue Fashion' },
  { url: 'https://www.elle.com/fashion-trends', label: 'Elle Trends' },
  { url: 'https://www.whowhatwear.com/fashion-trends', label: 'WhoWhatWear Trends' },
  // Pinterest trend pages (public, no API needed)
  { url: 'https://www.pinterest.com/ideas/fashion/901179409185', label: 'Pinterest Fashion Ideas' },
  { url: 'https://www.pinterest.co.uk/ideas/womens-fashion', label: 'Pinterest UK Womens Fashion' },
  // Instagram hashtag pages via web
  { url: 'https://www.instagram.com/explore/tags/outfitinspo', label: 'Instagram #outfitinspo' },
  { url: 'https://www.instagram.com/explore/tags/fashiontrends', label: 'Instagram #fashiontrends' },
]

interface EditorialExtraction {
  season: string
  key_colours: string[]
  silhouettes: string[]
  occasion_trends: {
    wedding_guest: string
    work: string
    night_out: string
    casual: string
    beach: string
  }
  fabrics: string[]
  accessories: string[]
  styling_notes: string[]
  summary: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const adminSecret = Deno.env.get('ADMIN_INGEST_SECRET');
  if (!adminSecret || req.headers.get('x-admin-secret') !== adminSecret) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY')
    if (!firecrawlApiKey) {
      console.error('FIRECRAWL_API_KEY not configured')
      return new Response(
        JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY not configured. No data was stored.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')
    if (!lovableApiKey) {
      console.error('LOVABLE_API_KEY not configured')
      return new Response(
        JSON.stringify({ success: false, error: 'LOVABLE_API_KEY not configured. No data was stored.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Step 1: Scrape all URLs with Firecrawl
    const scrapedContent = await scrapeAllUrls(firecrawlApiKey)

    if (scrapedContent.length === 0) {
      console.error('All scrape attempts failed — no content collected')
      return new Response(
        JSON.stringify({ success: false, error: 'All scrape attempts failed. No data was stored.', failed_urls: SCRAPE_URLS.map(u => u.label) }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 2: Send combined content to AI for extraction
    const extraction = await extractTrendsWithAI(scrapedContent, lovableApiKey)

    if (!extraction) {
      console.error('AI extraction failed — no data stored')
      return new Response(
        JSON.stringify({ success: false, error: 'AI trend extraction failed. No data was stored.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 3: Store in fashion_trends table
    await storeTrends(extraction, supabaseClient)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Fashion editorial trends scraped and stored successfully',
        urls_scraped: scrapedContent.length,
        urls_failed: SCRAPE_URLS.length - scrapedContent.length,
        season: extraction.season,
        source: 'firecrawl_editorial'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in scrape-fashion-editorial:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to scrape fashion editorial trends' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function scrapeAllUrls(apiKey: string): Promise<{ label: string; markdown: string }[]> {
  const results: { label: string; markdown: string }[] = []

  for (const { url, label } of SCRAPE_URLS) {
    try {
      console.log(`Scraping: ${label} (${url})`)

      const response = await fetch(FIRECRAWL_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 3000,
        }),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        console.error(`Firecrawl error for ${label} [${response.status}]: ${errorBody}`)
        continue
      }

      const data = await response.json()
      const markdown = data?.data?.markdown || data?.markdown || ''

      if (markdown && markdown.length > 100) {
        console.log(`✓ ${label}: ${markdown.length} chars scraped`)
        // Truncate to avoid token limits — keep first 3000 chars per source
        results.push({ label, markdown: markdown.slice(0, 3000) })
      } else {
        console.log(`✗ ${label}: insufficient content (${markdown.length} chars)`)
      }
    } catch (error) {
      console.error(`✗ ${label}: scrape failed —`, error)
    }
  }

  return results
}

async function extractTrendsWithAI(
  scrapedContent: { label: string; markdown: string }[],
  lovableApiKey: string
): Promise<EditorialExtraction | null> {
  const combinedContent = scrapedContent
    .map(({ label, markdown }) => `--- ${label} ---\n${markdown}`)
    .join('\n\n')

  const systemPrompt = `You are a fashion trend analyst. Extract current fashion trends from the provided editorial and social media content. Return ONLY valid JSON matching the exact schema requested. Be specific with colours (e.g. "butter yellow" not just "yellow"), silhouettes, and fabrics. Base your analysis only on what you find in the content provided.`

  const userPrompt = `Analyse the following fashion editorial content scraped from major fashion publications, Pinterest, and Instagram. Extract the current trends into this exact JSON structure:

{
  "season": "current season + year e.g. Spring/Summer 2026",
  "key_colours": ["array of specific trending colours"],
  "silhouettes": ["array of trending silhouettes/shapes"],
  "occasion_trends": {
    "wedding_guest": "brief description of current wedding guest trends",
    "work": "brief description of current workwear trends",
    "night_out": "brief description of current going out trends",
    "casual": "brief description of current casual/everyday trends",
    "beach": "brief description of current beach/holiday trends"
  },
  "fabrics": ["array of trending fabrics and materials"],
  "accessories": ["array of trending accessories"],
  "styling_notes": ["array of key styling tips and notes"],
  "summary": "2-3 sentence summary of the overall trend direction"
}

Content to analyse:

${combinedContent}`

  try {
    const response = await fetch(`${AI_GATEWAY_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`AI Gateway error [${response.status}]: ${errorBody}`)
      return null
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content

    if (!content) {
      console.error('AI returned empty content')
      return null
    }

    const parsed = JSON.parse(content) as EditorialExtraction
    console.log(`AI extraction complete for season: ${parsed.season}`)
    return parsed
  } catch (error) {
    console.error('AI extraction error:', error)
    return null
  }
}

async function storeTrends(extraction: EditorialExtraction, supabaseClient: any): Promise<void> {
  const seasonSlug = extraction.season.toLowerCase().replace(/[\s\/]+/g, '_')

  // Store main editorial trend summary
  const mainTrend = {
    name: `Fashion Editorial: ${extraction.season}`,
    category: 'Editorial',
    trend_score: 90,
    growth_rate: 'Current',
    popularity_rank: 1,
    season: extraction.season.split(/[\s\/]+/)[0] || getCurrentSeason(),
    occasions: Object.keys(extraction.occasion_trends),
    colors: extraction.key_colours,
    description: extraction.summary,
    source: 'firecrawl_editorial',
    external_id: `editorial_${seasonSlug}`,
  }

  const { error: mainError } = await supabaseClient
    .from('fashion_trends')
    .upsert(mainTrend, { onConflict: 'external_id' })

  if (mainError) {
    console.error('Error storing main editorial trend:', mainError)
  } else {
    console.log('✓ Stored main editorial trend')
  }

  // Store silhouettes as a trend
  if (extraction.silhouettes.length > 0) {
    const silhouetteTrend = {
      name: `Trending Silhouettes: ${extraction.season}`,
      category: 'Silhouettes',
      trend_score: 85,
      growth_rate: 'Current',
      season: extraction.season.split(/[\s\/]+/)[0] || getCurrentSeason(),
      occasions: ['Versatile'],
      colors: extraction.key_colours.slice(0, 4),
      description: `Key silhouettes: ${extraction.silhouettes.join(', ')}. Fabrics: ${extraction.fabrics.join(', ')}`,
      source: 'firecrawl_editorial',
      external_id: `editorial_silhouettes_${seasonSlug}`,
    }

    const { error } = await supabaseClient
      .from('fashion_trends')
      .upsert(silhouetteTrend, { onConflict: 'external_id' })

    if (error) console.error('Error storing silhouette trend:', error)
    else console.log('✓ Stored silhouette trend')
  }

  // Store each occasion trend
  for (const [occasion, description] of Object.entries(extraction.occasion_trends)) {
    if (!description) continue

    const occasionTrend = {
      name: `${formatOccasion(occasion)}: ${extraction.season}`,
      category: 'Occasion',
      trend_score: 80,
      growth_rate: 'Current',
      season: extraction.season.split(/[\s\/]+/)[0] || getCurrentSeason(),
      occasions: [formatOccasion(occasion)],
      colors: extraction.key_colours.slice(0, 3),
      description,
      source: 'firecrawl_editorial',
      external_id: `editorial_${occasion}_${seasonSlug}`,
    }

    const { error } = await supabaseClient
      .from('fashion_trends')
      .upsert(occasionTrend, { onConflict: 'external_id' })

    if (error) console.error(`Error storing ${occasion} trend:`, error)
    else console.log(`✓ Stored ${occasion} trend`)
  }

  // Store accessories trend
  if (extraction.accessories.length > 0) {
    const accessoriesTrend = {
      name: `Trending Accessories: ${extraction.season}`,
      category: 'Accessories',
      trend_score: 75,
      growth_rate: 'Current',
      season: extraction.season.split(/[\s\/]+/)[0] || getCurrentSeason(),
      occasions: ['Daily', 'Evening', 'Special Events'],
      colors: extraction.key_colours.slice(0, 3),
      description: `Must-have accessories: ${extraction.accessories.join(', ')}. Styling tips: ${extraction.styling_notes.slice(0, 3).join('; ')}`,
      source: 'firecrawl_editorial',
      external_id: `editorial_accessories_${seasonSlug}`,
    }

    const { error } = await supabaseClient
      .from('fashion_trends')
      .upsert(accessoriesTrend, { onConflict: 'external_id' })

    if (error) console.error('Error storing accessories trend:', error)
    else console.log('✓ Stored accessories trend')
  }
}

function formatOccasion(key: string): string {
  const map: Record<string, string> = {
    wedding_guest: 'Wedding Guest',
    work: 'Work',
    night_out: 'Night Out',
    casual: 'Casual',
    beach: 'Beach & Holiday',
  }
  return map[key] || key
}

function getCurrentSeason(): string {
  const month = new Date().getMonth()
  if (month >= 2 && month <= 4) return 'Spring'
  if (month >= 5 && month <= 7) return 'Summer'
  if (month >= 8 && month <= 10) return 'Fall'
  return 'Winter'
}
