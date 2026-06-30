// Geocoding proxy — calls Photon (Komoot) server-side to bypass any
// client CSP/CORS issues. Returns a small, stable shape for LocationInput.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface PhotonFeature {
  properties?: Record<string, unknown>;
}

interface Suggestion {
  short: string;
  display: string;
}

function format(feature: PhotonFeature): Suggestion | null {
  const p = (feature.properties ?? {}) as Record<string, string | undefined>;
  const venue = p.name || p.street;
  const city = p.city || p.town || p.village || p.locality || p.county;
  const region = p.state;
  const country = p.country;
  const unique = Array.from(
    new Set([venue, city, region, country].filter(Boolean) as string[]),
  );
  const short = unique.slice(0, 3).join(", ");
  const display = unique.join(", ");
  if (!short && !display) return null;
  return { short: short || display, display: display || short };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    let q = "";
    if (req.method === "GET") {
      q = new URL(req.url).searchParams.get("q") ?? "";
    } else {
      const body = await req.json().catch(() => ({}));
      q = String(body?.q ?? "");
    }
    q = q.trim();
    if (q.length < 2) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("lang", "en");
    url.searchParams.set("limit", "6");
    url.searchParams.set("q", q);

    const res = await fetch(url.toString());
    if (!res.ok) {
      return new Response(
        JSON.stringify({ suggestions: [], error: `Photon ${res.status}` }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const json = await res.json();
    const features: PhotonFeature[] = Array.isArray(json.features)
      ? json.features
      : [];
    const seen = new Set<string>();
    const suggestions = features
      .map(format)
      .filter((s): s is Suggestion => Boolean(s?.short))
      .filter((s) => (seen.has(s.short) ? false : (seen.add(s.short), true)));

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ suggestions: [], error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
