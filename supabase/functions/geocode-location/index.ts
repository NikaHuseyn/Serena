// Location/venue search proxy. It combines geographical results with POI
// providers so restaurants, clubs, hotels and entertainment venues appear too.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface PhotonFeature {
  properties?: Record<string, unknown>;
}

interface NominatimResult {
  name?: string;
  display_name?: string;
  class?: string;
  type?: string;
  address?: Record<string, string | undefined>;
  namedetails?: Record<string, string | undefined>;
}

interface SerperPlace {
  title?: string;
  address?: string;
  type?: string;
  category?: string;
}

interface Suggestion {
  short: string;
  display: string;
  category?: string;
  source?: "serper" | "photon" | "nominatim";
  score?: number;
}

const USER_AGENT = "OutfitOracle/1.0 location search";
const VENUE_KEYS = new Set([
  "amenity",
  "club",
  "tourism",
  "leisure",
  "shop",
  "office",
  "craft",
]);
const VENUE_WORDS = [
  "restaurant",
  "bar",
  "cafe",
  "pub",
  "club",
  "polo",
  "hotel",
  "theatre",
  "cinema",
  "music",
  "venue",
  "stadium",
  "arena",
  "gallery",
  "museum",
  "nightclub",
  "members",
];

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueParts(parts: Array<string | undefined>): string[] {
  return Array.from(new Set(parts.map((p) => p?.trim()).filter(Boolean) as string[]));
}

function compactAddress(display?: string): string | undefined {
  if (!display) return undefined;
  return uniqueParts(display.split(",").map((p) => p.trim())).slice(0, 5).join(", ");
}

function looksLikeVenue(category?: string, source?: Suggestion["source"]): boolean {
  if (source === "serper") return true;
  const text = normalise(category ?? "");
  return VENUE_WORDS.some((word) => text.includes(word));
}

function queryMatchScore(q: string, suggestion: Suggestion): number {
  const query = normalise(q);
  const short = normalise(suggestion.short);
  if (!query || !short) return 0;
  if (short === query) return 25;
  if (short.startsWith(query)) return 18;
  if (short.includes(query)) return 12;
  const queryTokens = query.split(" ").filter((token) => token.length > 2);
  return queryTokens.filter((token) => short.includes(token)).length * 4;
}

function rank(q: string, suggestion: Suggestion): Suggestion {
  const sourceScore = suggestion.source === "serper" ? 55 : suggestion.source === "photon" ? 35 : 30;
  const venueScore = looksLikeVenue(suggestion.category, suggestion.source) ? 30 : 0;
  return {
    ...suggestion,
    score: sourceScore + venueScore + queryMatchScore(q, suggestion),
  };
}

function formatPhoton(feature: PhotonFeature): Suggestion | null {
  const p = (feature.properties ?? {}) as Record<string, string | undefined>;
  const venue = p.name || p.street;
  const city = p.city || p.town || p.village || p.locality || p.county;
  const region = p.state;
  const country = p.country;
  const unique = uniqueParts([venue, city, region, country]);
  const short = unique.slice(0, 3).join(", ");
  const category = uniqueParts([p.osm_key, p.osm_value]).join(" · ");
  const display = unique.join(", ");
  if (!short && !display) return null;
  return { short: short || display, display: display || short, category, source: "photon" };
}

function formatNominatim(item: NominatimResult): Suggestion | null {
  const address = item.address ?? {};
  const name = item.name || item.namedetails?.name;
  const city = address.city || address.town || address.village || address.hamlet || address.suburb || address.county;
  const region = address.state;
  const country = address.country;
  const short = uniqueParts([name, city, region, country]).slice(0, 3).join(", ");
  const display = compactAddress(item.display_name) || short;
  const category = uniqueParts([item.class, item.type]).join(" · ");
  if (!short && !display) return null;
  return { short: short || display, display: display || short, category, source: "nominatim" };
}

function formatSerper(place: SerperPlace): Suggestion | null {
  const short = place.title?.trim();
  const display = compactAddress(place.address) || place.address?.trim() || short;
  const category = place.type || place.category;
  if (!short && !display) return null;
  return { short: short || display!, display: display || short!, category, source: "serper" };
}

async function fetchPhoton(q: string): Promise<Suggestion[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("lang", "en");
  url.searchParams.set("limit", "8");
  url.searchParams.set("q", q);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const json = await res.json();
  const features: PhotonFeature[] = Array.isArray(json.features) ? json.features : [];
  return features.map(formatPhoton).filter((s): s is Suggestion => Boolean(s?.short));
}

async function fetchNominatim(q: string): Promise<Suggestion[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "8");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("namedetails", "1");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("accept-language", "en");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const json = await res.json();
  const results: NominatimResult[] = Array.isArray(json) ? json : [];
  return results.map(formatNominatim).filter((s): s is Suggestion => Boolean(s?.short));
}

async function fetchSerperPlaces(q: string): Promise<Suggestion[]> {
  const apiKey = Deno.env.get("SERPER_API_KEY");
  if (!apiKey) return [];

  const res = await fetch("https://google.serper.dev/places", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ q, num: 8 }),
  });
  if (!res.ok) throw new Error(`Serper places ${res.status}`);
  const json = await res.json();
  const places: SerperPlace[] = Array.isArray(json.places) ? json.places : [];
  return places.map(formatSerper).filter((s): s is Suggestion => Boolean(s?.short));
}

function dedupeAndRank(q: string, suggestions: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  return suggestions
    .map((s) => rank(q, s))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .filter((s) => {
      const key = normalise(`${s.short} ${s.display}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8)
    .map(({ score: _score, ...suggestion }) => suggestion);
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

    const results = await Promise.allSettled([
      fetchSerperPlaces(q),
      fetchPhoton(q),
      fetchNominatim(q),
    ]);
    const suggestions = dedupeAndRank(
      q,
      results.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
    );

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
