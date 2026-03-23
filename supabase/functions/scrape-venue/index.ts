import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { venueName, venueQuery } = await req.json();

    if (!venueName && !venueQuery) {
      return new Response(
        JSON.stringify({ success: false, error: 'Venue name or query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const query = venueQuery || `${venueName} restaurant bar club hotel official website`;

    // Step 1: Search for the venue website using Firecrawl
    console.log('Searching for venue:', query);
    const searchResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit: 3,
        scrapeOptions: {
          formats: ['markdown'],
          onlyMainContent: true,
        },
      }),
    });

    const searchData = await searchResponse.json();

    if (!searchResponse.ok) {
      console.error('Firecrawl search error:', searchData);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to search for venue' }),
        { status: searchResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Collect scraped content from search results
    const results = searchData.data || searchData.results || [];
    const scrapedContent = results
      .map((r: any) => r.markdown || r.description || '')
      .filter(Boolean)
      .join('\n\n---\n\n')
      .slice(0, 8000); // Limit content size

    if (!scrapedContent) {
      console.log('No content found for venue:', venueName);
      return new Response(
        JSON.stringify({ success: true, venueContext: null, message: 'No venue information found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Use AI to extract dress code / atmosphere info from scraped content
    console.log('Extracting venue context from scraped content, length:', scrapedContent.length);
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content: `You extract venue information relevant to outfit planning. Return ONLY valid JSON with no extra text.`
          },
          {
            role: 'user',
            content: `Extract dress code and atmosphere info for "${venueName}" from this website content. Return JSON:
{
  "venue_name": "string",
  "venue_type": "restaurant|bar|club|hotel|event_space|other",
  "dress_code": "black_tie|formal|smart_casual|casual|none_specified",
  "dress_code_details": "any specific dress code rules mentioned",
  "atmosphere": "string describing the vibe",
  "formality_level": 1-10,
  "style_keywords": ["elegant", "trendy", etc],
  "notes": "any other relevant info for outfit planning"
}

Content:
${scrapedContent}`
          }
        ],
        max_completion_tokens: 500,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI extraction error:', errText);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to extract venue context' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content?.trim() || '';
    
    let venueContext = null;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        venueContext = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('Failed to parse venue context JSON:', parseError);
    }

    console.log('Extracted venue context:', JSON.stringify(venueContext));

    return new Response(
      JSON.stringify({ success: true, venueContext }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in scrape-venue:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
