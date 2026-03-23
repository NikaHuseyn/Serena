/**
 * Maps vague venue/occasion descriptions to inferred formality levels.
 * Used when the user doesn't name a specific venue.
 */

export interface VagueVenueResult {
  isVague: true;
  inferredFormality: string;
  mealType: string | null;
  occasionType: string | null;
  description: string; // Original adjective cluster for the AI
}

// Adjective → formality mapping
const FORMALITY_MAP: { pattern: RegExp; formality: string }[] = [
  { pattern: /\b(fancy|fine dining|upscale|elegant|posh|high[- ]?end|luxurious|swanky)\b/i, formality: 'formal smart' },
  { pattern: /\b(smart|somewhere smart|smart place|classy|sophisticated)\b/i, formality: 'smart casual to formal' },
  { pattern: /\b(nice|good|decent|lovely|great)\b/i, formality: 'smart casual' },
  { pattern: /\b(cool|trendy|hipster|stylish|fashionable|chic)\b/i, formality: 'fashion-forward casual' },
  { pattern: /\b(casual|low[- ]?key|laid[- ]?back|chill|relaxed|easy[- ]?going)\b/i, formality: 'relaxed casual' },
  { pattern: /\b(local|neighbourhood|neighborhood)\b/i, formality: 'relaxed casual' },
  { pattern: /\b(rooftop|terrace|sky[- ]?bar|garden)\b/i, formality: 'context-dependent' },
];

// Meal type detection
const MEAL_PATTERNS: { pattern: RegExp; meal: string }[] = [
  { pattern: /\b(dinner|supper|evening meal)\b/i, meal: 'dinner' },
  { pattern: /\b(lunch|midday)\b/i, meal: 'lunch' },
  { pattern: /\b(brunch|late breakfast)\b/i, meal: 'brunch' },
  { pattern: /\b(drinks|cocktails?|aperitif)\b/i, meal: 'drinks' },
  { pattern: /\b(breakfast|morning)\b/i, meal: 'breakfast' },
];

// Occasion type detection
const OCCASION_PATTERNS: { pattern: RegExp; occasion: string }[] = [
  { pattern: /\b(date|romantic|anniversary|valentines?|proposal)\b/i, occasion: 'date' },
  { pattern: /\b(work|business|corporate|client|colleague|networking)\b/i, occasion: 'work' },
  { pattern: /\b(friends?|mates?|girls?|guys?|lads?|group)\b/i, occasion: 'friends' },
  { pattern: /\b(family|parents?|in[- ]?laws?|relatives?|mum|dad|mother|father)\b/i, occasion: 'family' },
  { pattern: /\b(birthday|celebration|party|hen|stag|bachelorette)\b/i, occasion: 'celebration' },
  { pattern: /\b(night out|going out|club|clubbing)\b/i, occasion: 'night out' },
];

// Generic venue words that confirm venue is vague (no proper name)
const GENERIC_VENUE_WORDS = /\b(restaurant|bar|club|place|spot|venue|cafe|café|bistro|pub|lounge|eatery|joint|somewhere|dinner|lunch|brunch|breakfast|drinks|supper|cocktails?)\b/i;

/**
 * Detects if a message describes a venue vaguely (adjective + generic noun)
 * rather than naming a specific venue.
 *
 * Returns null if the message names a specific venue (handled by venueEventDetection).
 */
export function detectVagueVenue(message: string): VagueVenueResult | null {
  // Must contain a generic venue word (not a proper name)
  if (!GENERIC_VENUE_WORDS.test(message)) return null;

  // Check if any formality adjective is present
  let inferredFormality: string | null = null;
  for (const { pattern, formality } of FORMALITY_MAP) {
    if (pattern.test(message)) {
      inferredFormality = formality;
      break;
    }
  }

  // If no adjective found but there's a generic venue word, still treat as vague
  if (!inferredFormality) {
    inferredFormality = 'smart casual'; // safe default
  }

  // Detect meal type
  let mealType: string | null = null;
  for (const { pattern, meal } of MEAL_PATTERNS) {
    if (pattern.test(message)) {
      mealType = meal;
      break;
    }
  }

  // Detect occasion type
  let occasionType: string | null = null;
  for (const { pattern, occasion } of OCCASION_PATTERNS) {
    if (pattern.test(message)) {
      occasionType = occasion;
      break;
    }
  }

  return {
    isVague: true,
    inferredFormality,
    mealType,
    occasionType,
    description: message,
  };
}

/**
 * Determine emotional tone categories relevant to the occasion.
 */
export interface EmotionalTone {
  id: string;
  emoji: string;
  label: string;
  description: string;
}

export function getRelevantEmotionalTones(
  mealType: string | null,
  occasionType: string | null,
): EmotionalTone[] {
  // Night out / bar / drinks
  if (occasionType === 'night out' || mealType === 'drinks') {
    return [
      { id: 'bold', emoji: '🔥', label: 'Bold & striking', description: 'Make an entrance and own the room' },
      { id: 'cool', emoji: '😎', label: 'Effortlessly cool', description: 'Look amazing without looking like you tried' },
      { id: 'flirty', emoji: '💃', label: 'Feminine & flirty', description: 'Playful, confident, and eye-catching' },
      { id: 'sleek', emoji: '🖤', label: 'Sleek & minimal', description: 'Sharp, clean lines — less is more' },
    ];
  }

  // Work / professional
  if (occasionType === 'work') {
    return [
      { id: 'powerful', emoji: '💪', label: 'Quietly powerful', description: 'Command the room without saying a word' },
      { id: 'approachable', emoji: '🤝', label: 'Approachably polished', description: 'Professional but warm and open' },
      { id: 'creative', emoji: '🎨', label: 'Creatively distinctive', description: 'Show personality within professional bounds' },
    ];
  }

  // Casual / daytime / brunch / breakfast
  if (mealType === 'brunch' || mealType === 'breakfast' || mealType === 'lunch') {
    return [
      { id: 'relaxed', emoji: '☀️', label: 'Relaxed & put-together', description: 'Casual but clearly intentional' },
      { id: 'soft', emoji: '🌸', label: 'Soft & feminine', description: 'Light, delicate, and effortless' },
      { id: 'fun', emoji: '😄', label: 'Fun & colourful', description: 'Bright, bold, and full of personality' },
    ];
  }

  // Default: dinner at a restaurant (most common)
  return [
    { id: 'romantic', emoji: '💫', label: 'Romantic', description: 'For a date or intimate dinner' },
    { id: 'polished', emoji: '💼', label: 'Polished', description: 'For a work dinner or meeting someone important' },
    { id: 'warm', emoji: '😊', label: 'Warm & friendly', description: 'For dinner with friends or family' },
    { id: 'chic', emoji: '✨', label: 'Effortlessly chic', description: 'Neutral elegance, no specific dynamic' },
  ];
}

/**
 * Check if the user's message already contains an explicit emotional goal.
 */
export function detectExplicitEmotionalGoal(message: string): string | null {
  const patterns: { pattern: RegExp; tone: string }[] = [
    { pattern: /\b(romantic|sexy|seductive|alluring|date[- ]?night)\b/i, tone: 'romantic' },
    { pattern: /\b(professional|polished|powerful|authoritative|work|business)\b/i, tone: 'polished' },
    { pattern: /\b(warm|friendly|approachable|comfortable|cosy|cozy)\b/i, tone: 'warm' },
    { pattern: /\b(chic|effortless|elegant|sophisticated|classy)\b/i, tone: 'chic' },
    { pattern: /\b(bold|striking|dramatic|statement|head[- ]?turning)\b/i, tone: 'bold' },
    { pattern: /\b(cool|edgy|trendy|minimal|minimalist|sleek)\b/i, tone: 'cool' },
    { pattern: /\b(fun|colourful|colorful|playful|vibrant|bright)\b/i, tone: 'fun' },
    { pattern: /\b(flirty|feminine|girly|cute|pretty)\b/i, tone: 'flirty' },
    { pattern: /\b(creative|artistic|distinctive|unique|individual)\b/i, tone: 'creative' },
    { pattern: /\b(relaxed|laid[- ]?back|casual|easy|chill)\b/i, tone: 'relaxed' },
    { pattern: /\b(soft|delicate|gentle|understated)\b/i, tone: 'soft' },
  ];

  for (const { pattern, tone } of patterns) {
    if (pattern.test(message)) return tone;
  }
  return null;
}
