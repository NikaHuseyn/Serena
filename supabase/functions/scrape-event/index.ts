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
    const { eventName } = await req.json();

    if (!eventName) {
      return new Response(
        JSON.stringify({ success: false, error: 'Event name is required' }),
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

    const query = `${eventName} event official website dress code`;

    console.log('Searching for event:', query);
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
        JSON.stringify({ success: false, error: 'Failed to search for event' }),
        { status: searchResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = searchData.data || searchData.results || [];
    const scrapedContent = results
      .map((r: any) => r.markdown || r.description || '')
      .filter(Boolean)
      .join('\n\n---\n\n')
      .slice(0, 8000);

    if (!scrapedContent) {
      console.log('No content found for event:', eventName);
      return new Response(
        JSON.stringify({ success: true, eventContext: null, message: 'No event information found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Extracting event context from scraped content, length:', scrapedContent.length);

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
            content: `You extract event information relevant to outfit planning. Return ONLY valid JSON with no extra text.`
          },
          {
            role: 'user',
            content: `Extract dress code and event details for "${eventName}" from this website content. Return JSON:
{
  "event_name": "string",
  "event_type": "festival|gala|conference|wedding|award_ceremony|concert|exhibition|sports|charity|other",
  "dress_code": "black_tie|formal|smart_casual|casual|costume|themed|none_specified",
  "dress_code_details": "any specific dress code rules or restrictions mentioned",
  "indoor_outdoor": "indoor|outdoor|both|unknown",
  "time_of_day": "daytime|evening|all_day|unknown",
  "style_guidance": "any specific style tips, restrictions, or recommendations from the event page",
  "formality_level": 1-10,
  "style_keywords": ["elegant", "festival", etc],
  "practical_notes": "any practical info like 'wear comfortable shoes' or 'no high heels on grass'"
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
        JSON.stringify({ success: false, error: 'Failed to extract event context' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content?.trim() || '';

    let eventContext = null;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        eventContext = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('Failed to parse event context JSON:', parseError);
    }

    console.log('Extracted event context:', JSON.stringify(eventContext));

    return new Response(
      JSON.stringify({ success: true, eventContext }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in scrape-event:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
