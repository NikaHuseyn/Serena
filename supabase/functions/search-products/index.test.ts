import "https://deno.land/std@0.224.0/dotenv/load.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

Deno.test("search-products returns results for navy silk midi dress", async () => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/search-products`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      query: "navy silk midi dress",
      budget_tier: "mid",
      regions: ["uk"],
      max_results: 4,
    }),
  });

  const body = await response.text();
  console.log("Status:", response.status);
  console.log("Response:", body);

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}: ${body}`);
  }

  const data = JSON.parse(body);
  console.log("Query:", data.query);
  console.log("Region:", data.region);
  console.log("Budget tier:", data.budget_tier);
  console.log("Total results:", data.total);

  if (data.results && data.results.length > 0) {
    console.log("\n--- Products ---");
    for (const p of data.results) {
      console.log(`• ${p.title} | £${p.price} | ${p.source} | ${p.link?.substring(0, 60)}...`);
    }
  } else {
    console.log("No results returned (Serper may have no data or API key issue)");
  }
});
