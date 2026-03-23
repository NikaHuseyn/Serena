/**
 * Extracts a location name and/or future date from a user's styling message
 * so that weather can be fetched for the right place and time.
 */

// ── Location extraction ────────────────────────────────────────────

const LOCATION_PATTERNS = [
  // "at [Venue] in [City]" — grab the city only (must come first to avoid venue name capture)
  /\bat\s+[A-Z][A-Za-z''&\-\s]{2,30}\s+in\s+((?:[A-Z\u00C0-\u024F][A-Za-z\u00C0-\u024F'.\-]+)(?:\s+[A-Za-z\u00C0-\u024F'.\-]+){0,3}?)\b/,
  // "in [City], [Country]" or "in [City]" — require uppercase start (no 'i' flag)
  /\b(?:in|near|outside|around|visiting|heading to|flying to|travelling to|traveling to)\s+((?:[A-Z\u00C0-\u024F][A-Za-z\u00C0-\u024F'.\-]+)(?:\s+[A-Za-z\u00C0-\u024F'.\-]+){0,3}?)(?:\s*,\s*((?:[A-Z\u00C0-\u024F][A-Za-z\u00C0-\u024F'.\-]+)(?:\s+[A-Za-z\u00C0-\u024F'.\-]+){0,3}?))?\s*(?:[.!?,;]|$|\b(?:next|this|on|for|and|with|tomorrow|tonight))/,
  // "[City] wedding / dinner / event / party / gala" — require uppercase city
  /\b((?:[A-Z\u00C0-\u024F][A-Za-z\u00C0-\u024F'.\-]+)(?:\s+[A-Za-z\u00C0-\u024F'.\-]+){0,3}?)\s+(?:wedding|dinner|lunch|brunch|event|party|gala|ball|conference|festival|ceremony|reception|meetup|concert)\b/,
];

const LOCATION_FALSE_POSITIVES = new Set([
  'I', 'My', 'The', 'A', 'An', 'We', 'They', 'He', 'She', 'It',
  'This', 'That', 'What', 'How', 'Going', 'Looking', 'Black', 'White',
  'Smart', 'Casual', 'Formal', 'Business', 'Date', 'Night', 'Day',
  'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
  'Nice', 'Good', 'Great', 'Big', 'Small', 'New', 'Old', 'Best', 'Top',
  'Some', 'Any', 'Every', 'All', 'Just', 'Really', 'Very', 'Pretty',
  'Home', 'Work', 'Office', 'Church', 'School',
]);

export function extractLocation(message: string): string | null {
  for (const pattern of LOCATION_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const city = match[1].trim().replace(/\s+$/, '');
      if (city.length > 1 && !LOCATION_FALSE_POSITIVES.has(city)) {
        const country = match[2]?.trim();
        return country ? `${city}, ${country}` : city;
      }
    }
  }
  return null;
}

// ── Date extraction ─────────────────────────────────────────────────

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Returns an ISO date string (YYYY-MM-DD) if the user mentions a future date,
 * or null if no date / today is mentioned.
 */
export function extractFutureDate(message: string): string | null {
  const lower = message.toLowerCase();
  const now = new Date();

  // "tomorrow"
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return toISO(d);
  }

  // "tonight" → today (use current weather)
  if (/\btonight\b/.test(lower)) {
    return null;
  }

  // "next [day]" or "this [day]"
  const dayMatch = lower.match(/\b(?:next|this|coming)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (dayMatch) {
    const targetDay = DAY_NAMES.indexOf(dayMatch[1]);
    const currentDay = now.getDay();
    let daysAhead = targetDay - currentDay;
    if (daysAhead <= 0) daysAhead += 7;
    if (dayMatch[0].startsWith('next') && daysAhead <= 7) {
      // "next Monday" when today is Monday → +7
      if (daysAhead < 7 && dayMatch[0].startsWith('next')) {
        // keep as-is for most cases, but if target == current, add 7
        if (daysAhead === 0) daysAhead = 7;
      }
    }
    const d = new Date(now);
    d.setDate(d.getDate() + daysAhead);
    // Cap at 14 days (WeatherAPI forecast limit)
    if (daysAhead > 14) return null;
    return toISO(d);
  }

  // "on the 15th" / "on the 3rd" / "on [Month] [day]"
  const ordinalMatch = lower.match(/\bon\s+the\s+(\d{1,2})(?:st|nd|rd|th)\b/);
  if (ordinalMatch) {
    const dayNum = parseInt(ordinalMatch[1], 10);
    const d = new Date(now.getFullYear(), now.getMonth(), dayNum);
    if (d <= now) d.setMonth(d.getMonth() + 1);
    const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff > 0 && diff <= 14) return toISO(d);
    return null;
  }

  // "next week" → +7 days
  if (/\bnext\s+week\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    return toISO(d);
  }

  return null;
}

function toISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

/**
 * Build a friendly day label like "Saturday" or "Tomorrow"
 */
export function formatDateLabel(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const target = new Date(isoDate + 'T12:00:00');
  const now = new Date();
  const diffDays = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';

  return target.toLocaleDateString('en-GB', { weekday: 'long' });
}
