// Shared CORS allow-list for Lovable preview/published origins and local dev.
// Falls back to "*" for unrecognized origins since these endpoints are
// protected by bearer-token auth or an admin secret, not cookies — reflecting
// the real Origin when it matches is just tighter default behavior.
const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/([a-z0-9-]+\.)*lovable\.app$/i,
  /^https:\/\/([a-z0-9-]+\.)*lovableproject\.com$/i,
  /^https:\/\/([a-z0-9-]+\.)*lovable\.dev$/i,
  /^http:\/\/localhost(:\d+)?$/i,
];

const DEFAULT_ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";

export function corsHeadersFor(
  req: Request,
  allowHeaders: string = DEFAULT_ALLOW_HEADERS,
): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin)) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": allowHeaders,
    Vary: "Origin",
  };
}
