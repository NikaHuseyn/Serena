// supabase/functions/go/index.ts
// Tracked link redirect: logs the click, then redirects to the retailer.
// Oracle renders links as: https://<project>.supabase.co/functions/v1/go?pid=<product_ref>&u=<user_id>&b=<brief_id>&s=<session_id>
// Only `pid` is required. Unknown/missing params are logged as null.
//
// Deploy note (Lovable/Supabase): this function must be PUBLIC (no JWT verification),
// because the browser hits it directly on click. In supabase/config.toml:
//   [functions.go]
//   verify_jwt = false

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Fallback if a destination can't be resolved
const FALLBACK_URL = "https://serena-outfitoracle.lovable.app/app"; // TODO: replace with your real domain

function isValidUuid(v: string | null): boolean {
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function isSafeHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const productRef = url.searchParams.get("pid");
  const userId = url.searchParams.get("u");
  const briefId = url.searchParams.get("b");
  const sessionId = url.searchParams.get("s");

  if (!productRef) {
    return Response.redirect(FALLBACK_URL, 302);
  }

  let destination = FALLBACK_URL;
  let partnerProductId: string | null = null;

  // Resolve destination:
  // 1) If productRef is a UUID, look it up in partner_products (Selectika feed)
  // 2) If productRef is itself a URL (scraped items in the pre-feed era), redirect to it
  if (isValidUuid(productRef)) {
    const { data } = await supabase
      .from("partner_products")
      .select("id, retailer_url, in_stock")
      .eq("id", productRef)
      .maybeSingle();
    if (data?.retailer_url) {
      destination = data.retailer_url;
      partnerProductId = data.id;
    }
  } else if (isSafeHttpUrl(productRef)) {
    destination = productRef;
  }

  // Log the click. Never block the redirect on logging failure.
  try {
    await supabase.from("link_clicks").insert({
      user_id: isValidUuid(userId) ? userId : null,
      product_ref: productRef,
      partner_product_id: partnerProductId,
      brief_id: isValidUuid(briefId) ? briefId : null,
      session_id: sessionId ?? null,
    });
  } catch (e) {
    console.error("link_clicks insert failed:", e);
  }

  return Response.redirect(destination, 302);
});
