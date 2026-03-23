import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// TYPE DEFINITIONS
// ============================================

interface WorkflowInput {
  userPrompt: string;
  userId: string;
  userLocation?: { lat: number; lon: number };
  userProfile?: UserProfile;
}

interface UserProfile {
  preferred_colors?: string[];
  preferred_patterns?: string[];
  preferred_fabrics?: string[];
  style_personality?: string[];
  body_type?: string;
  budget_min?: number;
  budget_max?: number;
  disliked_colors?: string[];
  disliked_styles?: string[];
}

interface InterpretedEvent {
  event_type: string;
  dress_code: string;
  setting: string;
  location: string;
  date: string;
  time_of_day: string;
  tone: string;
  environment_notes: string;
  is_historical: boolean;
  historical_era?: string;
  duration_hours?: number;
  indoor_outdoor: 'indoor' | 'outdoor' | 'mixed';
  formality_level: number; // 1-10
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active';
}

interface DressCodeRules {
  dress_code_name: string;
  required_elements: string[];
  forbidden_elements: string[];
  colour_guidance: string[];
  accessory_guidance: string[];
  footwear_guidance: string[];
  grooming_notes: string;
  cultural_considerations: string;
  common_mistakes: string[];
  formality_range: { min: number; max: number };
}

interface WeatherContext {
  temperature: number;
  feels_like: number;
  condition: string;
  description: string;
  humidity: number;
  wind_speed: number;
  wind_direction?: string;
  precipitation_chance?: number;
  uv_index?: number;
  layering_needed: boolean;
  ground_conditions: string;
  weather_warnings: string[];
  clothing_implications: string[];
}

interface WardrobeItem {
  id: string;
  name: string;
  category: string;
  colour: string;
  brand?: string;
  size?: string;
  image_url?: string;
  tags?: string[];
  seasonality: string[];
  formality_level: number;
  colour_family: string;
  silhouette?: string;
  practicality_score: number;
  weather_suitability: string[];
}

interface ProductResult {
  id: string;
  name: string;
  brand: string;
  price: number;
  rental_price?: number;
  category: string;
  colours: string[];
  sizes: string[];
  image_url: string;
  retailer_name: string;
  retailer_url: string;
  affiliate_url?: string;
  in_stock: boolean;
  source_type: 'purchase' | 'rental' | 'vintage';
}

interface StylingOutput {
  event_summary: {
    interpreted_event: InterpretedEvent;
    weather_summary: string;
    key_considerations: string[];
  };
  etiquette_guidance: {
    dress_code_explanation: string;
    do_list: string[];
    dont_list: string[];
    cultural_notes: string;
  };
  wardrobe_outfit: {
    items: WardrobeItem[];
    styling_notes: string;
    gaps_identified: string[];
  };
  shopping_options: {
    purchase_items: ProductResult[];
    rental_items: ProductResult[];
    vintage_items: ProductResult[];
    total_purchase_cost: number;
    total_rental_cost: number;
  };
  accessories: {
    recommended: string[];
    from_wardrobe: WardrobeItem[];
    to_purchase: ProductResult[];
  };
  weather_adjustments: {
    layering_strategy: string;
    protection_items: string[];
    backup_plan: string;
  };
  practical_considerations: {
    comfort_tips: string[];
    transport_notes: string;
    venue_considerations: string;
    time_of_day_adjustments: string;
  };
  checklist: string[];
  confidence_score: number;
  validation_notes: string[];
}

// ============================================
// MODULE 1: EVENT INTERPRETATION
// ============================================

async function interpretEvent(userPrompt: string): Promise<InterpretedEvent> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are an expert event interpreter for a UK-based personal styling app. Parse user prompts into structured event data. Be thorough in extracting all relevant details. Use British English spelling.

Historical events include: 1920s, 1930s, 1940s, 1950s, 1960s, 1970s, 1980s, Gatsby, Art Deco, Victorian, Edwardian, Medieval, Renaissance, etc.

Common dress codes: white tie, black tie, black tie optional, cocktail, smart casual, business casual, business formal, casual, beach formal, garden party, country casual, festival, sportswear, lounge, daywear, evening wear.`
        },
        {
          role: "user",
          content: `Parse this styling request into structured event data:\n\n"${userPrompt}"`
        }
      ],
      tools: [{
        type: "function",
        function: {
          name: "parse_event",
          description: "Parse user prompt into structured event data",
          parameters: {
            type: "object",
            properties: {
              event_type: { type: "string", description: "Type of event (wedding, interview, party, date, conference, etc.)" },
              dress_code: { type: "string", description: "Dress code (black tie, cocktail, smart casual, casual, etc.)" },
              setting: { type: "string", description: "Venue type (hotel, restaurant, outdoor, office, etc.)" },
              location: { type: "string", description: "Geographic location (city, country)" },
              date: { type: "string", description: "Date in YYYY-MM-DD format or description like 'next Saturday'" },
              time_of_day: { type: "string", description: "morning, afternoon, evening, night, all-day" },
              tone: { type: "string", description: "Event tone (formal, relaxed, romantic, professional, celebratory)" },
              environment_notes: { type: "string", description: "Additional environment details (e.g., 'outdoor terrace', 'air-conditioned', 'standing event')" },
              is_historical: { type: "boolean", description: "Whether this is a themed/historical event" },
              historical_era: { type: "string", description: "If historical, the specific era (1920s, 1930s, Victorian, etc.)" },
              duration_hours: { type: "number", description: "Expected duration in hours" },
              indoor_outdoor: { type: "string", enum: ["indoor", "outdoor", "mixed"] },
              formality_level: { type: "number", description: "1-10 scale where 1 is very casual and 10 is ultra formal" },
              activity_level: { type: "string", enum: ["sedentary", "light", "moderate", "active"] }
            },
            required: ["event_type", "dress_code", "setting", "location", "date", "time_of_day", "tone", "environment_notes", "is_historical", "indoor_outdoor", "formality_level", "activity_level"]
          }
        }
      }],
      tool_choice: { type: "function", function: { name: "parse_event" } }
    }),
  });

  if (!response.ok) {
    console.error("Event interpretation failed:", await response.text());
    throw new Error("Failed to interpret event");
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  
  if (toolCall?.function?.arguments) {
    return JSON.parse(toolCall.function.arguments);
  }

  // Fallback parsing
  return {
    event_type: "general",
    dress_code: "smart casual",
    setting: "unknown",
    location: "UK",
    date: new Date().toISOString().split('T')[0],
    time_of_day: "afternoon",
    tone: "relaxed",
    environment_notes: "",
    is_historical: false,
    indoor_outdoor: "mixed",
    formality_level: 5,
    activity_level: "light"
  };
}

// ============================================
// MODULE 2: EVENT RULES ENGINE
// ============================================

function getDressCodeRules(event: InterpretedEvent): DressCodeRules {
  const dressCodeDatabase: Record<string, DressCodeRules> = {
    "white tie": {
      dress_code_name: "White Tie",
      required_elements: ["Floor-length evening gown", "Opera-length gloves optional", "Formal updo or elegant hairstyle"],
      forbidden_elements: ["Trousers", "Short dresses", "Casual footwear", "Excessive skin showing"],
      colour_guidance: ["Black", "Navy", "Deep jewel tones", "Metallics acceptable"],
      accessory_guidance: ["Fine jewellery", "Small clutch bag", "Elegant wrap or stole"],
      footwear_guidance: ["Formal heels", "Embellished evening shoes", "Satin or silk pumps"],
      grooming_notes: "Full formal makeup, manicured nails, sophisticated hairstyle",
      cultural_considerations: "Most formal dress code in Western culture. Often for state dinners, balls, very formal galas.",
      common_mistakes: ["Wearing cocktail-length dress", "Casual handbag", "Overly trendy styling"],
      formality_range: { min: 9, max: 10 }
    },
    "black tie": {
      dress_code_name: "Black Tie",
      required_elements: ["Floor-length gown OR elegant cocktail dress", "Formal styling", "Evening appropriate fabrics"],
      forbidden_elements: ["Casual fabrics", "Daywear", "Trainers", "Denim"],
      colour_guidance: ["Black", "Navy", "Burgundy", "Emerald", "Jewel tones", "Metallics"],
      accessory_guidance: ["Statement jewellery", "Clutch bag", "Elegant wrap"],
      footwear_guidance: ["Heels", "Dressy flats", "Embellished sandals"],
      grooming_notes: "Polished makeup, styled hair, well-groomed appearance",
      cultural_considerations: "Standard formal evening wear for galas, formal dinners, opening nights",
      common_mistakes: ["Too casual a dress", "Daytime accessories", "Over-accessorising"],
      formality_range: { min: 8, max: 9 }
    },
    "black tie optional": {
      dress_code_name: "Black Tie Optional",
      required_elements: ["Elegant cocktail dress OR dressy separates OR formal gown"],
      forbidden_elements: ["Casual wear", "Denim", "Trainers", "Daytime prints"],
      colour_guidance: ["Rich colours", "Black", "Jewel tones", "Metallics"],
      accessory_guidance: ["Statement pieces", "Evening bag", "Elegant jewellery"],
      footwear_guidance: ["Heels", "Dressy flats", "Elegant sandals"],
      grooming_notes: "Evening-appropriate makeup and hair",
      cultural_considerations: "More flexible than strict black tie but still formal",
      common_mistakes: ["Going too casual", "Wearing daytime dress"],
      formality_range: { min: 7, max: 8 }
    },
    "cocktail": {
      dress_code_name: "Cocktail",
      required_elements: ["Knee-length to midi dress OR dressy separates", "Polished appearance"],
      forbidden_elements: ["Floor-length gowns", "Casual wear", "Denim", "Trainers"],
      colour_guidance: ["Any elegant colours", "Patterns acceptable", "Metallics for evening"],
      accessory_guidance: ["Statement earrings", "Clutch or small bag", "Watch or bracelet"],
      footwear_guidance: ["Heels", "Dressy flats", "Ankle boots"],
      grooming_notes: "Polished but not overly formal makeup",
      cultural_considerations: "Versatile dress code for parties, receptions, dinners",
      common_mistakes: ["Too casual", "Too formal", "Inappropriate length"],
      formality_range: { min: 6, max: 7 }
    },
    "smart casual": {
      dress_code_name: "Smart Casual",
      required_elements: ["Polished appearance", "Put-together look", "Quality fabrics"],
      forbidden_elements: ["Sportswear", "Distressed denim", "Flip-flops", "Overly casual items"],
      colour_guidance: ["All colours acceptable", "Coordinated palette recommended"],
      accessory_guidance: ["Tasteful jewellery", "Quality bag", "Scarf or belt for interest"],
      footwear_guidance: ["Loafers", "Ankle boots", "Clean trainers", "Heels", "Ballet flats"],
      grooming_notes: "Well-groomed, natural to polished makeup",
      cultural_considerations: "Most common dress code for restaurants, theatre, casual events",
      common_mistakes: ["Too casual interpretation", "Scruffy items", "Athleisure"],
      formality_range: { min: 4, max: 6 }
    },
    "business casual": {
      dress_code_name: "Business Casual",
      required_elements: ["Professional appearance", "Neat clothing", "Work-appropriate items"],
      forbidden_elements: ["Jeans (usually)", "Trainers", "Revealing clothing", "Casual t-shirts"],
      colour_guidance: ["Professional colours", "Navy", "Grey", "Black", "Muted tones"],
      accessory_guidance: ["Professional watch", "Simple jewellery", "Structured bag"],
      footwear_guidance: ["Loafers", "Heels", "Ballet flats", "Ankle boots"],
      grooming_notes: "Professional, polished appearance",
      cultural_considerations: "Standard office wear, client meetings, business lunches",
      common_mistakes: ["Too casual", "Too revealing", "Inappropriate for workplace"],
      formality_range: { min: 5, max: 6 }
    },
    "business formal": {
      dress_code_name: "Business Formal",
      required_elements: ["Tailored suit OR professional dress", "Structured silhouette", "Quality fabrics"],
      forbidden_elements: ["Casual items", "Bright colours", "Trendy pieces", "Casual footwear"],
      colour_guidance: ["Navy", "Black", "Grey", "White", "Subtle patterns"],
      accessory_guidance: ["Minimal jewellery", "Professional watch", "Structured handbag"],
      footwear_guidance: ["Closed-toe heels", "Loafers", "Oxford shoes"],
      grooming_notes: "Polished, conservative, professional",
      cultural_considerations: "Board meetings, formal presentations, law/finance settings",
      common_mistakes: ["Too trendy", "Visible logos", "Inappropriate accessories"],
      formality_range: { min: 7, max: 8 }
    },
    "casual": {
      dress_code_name: "Casual",
      required_elements: ["Comfortable clothing", "Clean and presentable items"],
      forbidden_elements: ["Offensive graphics", "Dirty or damaged items"],
      colour_guidance: ["Any colours acceptable"],
      accessory_guidance: ["Personal choice", "Comfortable bags"],
      footwear_guidance: ["Trainers", "Sandals", "Boots", "Flats"],
      grooming_notes: "Clean and tidy appearance",
      cultural_considerations: "Everyday wear, casual gatherings, informal settings",
      common_mistakes: ["Sloppy appearance", "Inappropriate for venue"],
      formality_range: { min: 1, max: 3 }
    },
    "beach formal": {
      dress_code_name: "Beach Formal",
      required_elements: ["Flowing fabrics", "Light colours", "Weather-appropriate elegance"],
      forbidden_elements: ["Swimwear", "Very casual items", "Unsuitable footwear for sand"],
      colour_guidance: ["Pastels", "White", "Neutrals", "Ocean tones"],
      accessory_guidance: ["Natural materials", "Shell or pearl jewellery", "Woven bags"],
      footwear_guidance: ["Dressy sandals", "Wedges", "Espadrilles", "Barefoot acceptable"],
      grooming_notes: "Natural, beach-appropriate makeup, loose hairstyles",
      cultural_considerations: "Beach weddings, resort events, seaside parties",
      common_mistakes: ["Too formal for setting", "Impractical footwear", "Heavy fabrics"],
      formality_range: { min: 5, max: 7 }
    },
    "garden party": {
      dress_code_name: "Garden Party",
      required_elements: ["Feminine dress OR smart separates", "Light fabrics", "Pretty colours"],
      forbidden_elements: ["Dark heavy colours", "Stilettos (will sink in grass)", "Too formal"],
      colour_guidance: ["Florals", "Pastels", "Bright colours", "Summer prints"],
      accessory_guidance: ["Hat or fascinator", "Statement earrings", "Lightweight bag"],
      footwear_guidance: ["Block heels", "Wedges", "Flats", "Espadrilles"],
      grooming_notes: "Fresh, natural makeup, weather-proof hair",
      cultural_considerations: "British summer events, outdoor receptions, day parties",
      common_mistakes: ["Impractical heels", "Too heavy fabrics", "Forgetting sun protection"],
      formality_range: { min: 5, max: 6 }
    },
    "date night": {
      dress_code_name: "Date Night",
      required_elements: ["Flattering outfit", "Personal style expression", "Confidence-boosting pieces"],
      forbidden_elements: ["Nothing that makes you uncomfortable", "Over-trying"],
      colour_guidance: ["Whatever makes you feel attractive", "Red for romance", "Black for sophistication"],
      accessory_guidance: ["Signature jewellery", "Light perfume", "Small bag"],
      footwear_guidance: ["Heels if comfortable", "Stylish flats", "Ankle boots"],
      grooming_notes: "Feel-good grooming, enhanced natural features",
      cultural_considerations: "Dependent on venue - adjust to setting",
      common_mistakes: ["Over-dressing for venue", "Uncomfortable shoes", "Too much perfume"],
      formality_range: { min: 4, max: 7 }
    },
    "interview": {
      dress_code_name: "Interview",
      required_elements: ["Professional attire", "Neat appearance", "Industry-appropriate dress"],
      forbidden_elements: ["Casual wear", "Loud patterns", "Excessive accessories", "Strong perfume"],
      colour_guidance: ["Navy", "Grey", "Black", "White", "Conservative colours"],
      accessory_guidance: ["Minimal jewellery", "Professional watch", "Quality bag/portfolio"],
      footwear_guidance: ["Closed-toe shoes", "Low to moderate heels", "Polished loafers"],
      grooming_notes: "Clean, professional, conservative",
      cultural_considerations: "Research company culture, err on formal side",
      common_mistakes: ["Too casual", "Too flashy", "Unprepared appearance"],
      formality_range: { min: 6, max: 8 }
    },
    "1920s": {
      dress_code_name: "1920s / Gatsby",
      required_elements: ["Drop-waist silhouette", "Fringe or beading", "Art Deco influences", "Finger waves or bob hairstyle"],
      forbidden_elements: ["Modern items", "Jeans", "Trainers", "Contemporary silhouettes", "T-shirts", "Hoodies"],
      colour_guidance: ["Gold", "Black", "Silver", "Deep red", "Emerald", "Champagne"],
      accessory_guidance: ["Headband with feather", "Long pearl necklaces", "Cigarette holder prop", "Beaded clutch"],
      footwear_guidance: ["T-strap heels", "Mary Janes", "Kitten heels with embellishment"],
      grooming_notes: "Finger waves, dark lips, defined eyes, pale complexion",
      cultural_considerations: "Jazz Age glamour, speakeasy style, flapper aesthetic",
      common_mistakes: ["Modern jewellery", "Contemporary hairstyle", "Wrong silhouette"],
      formality_range: { min: 7, max: 9 }
    },
    "1930s": {
      dress_code_name: "1930s / Art Deco",
      required_elements: ["Bias-cut gown", "Elegant draping", "Sophisticated silhouette", "Hollywood glamour"],
      forbidden_elements: ["Modern items", "Jeans", "Trainers", "Contemporary silhouettes", "T-shirts", "Casual wear"],
      colour_guidance: ["Champagne", "Silver", "White", "Soft pink", "Pale blue", "Black"],
      accessory_guidance: ["Art Deco jewellery", "Fur stole or wrap", "Small beaded evening bag", "Hair clips"],
      footwear_guidance: ["Satin or silk heels", "T-strap shoes", "Delicate sandals"],
      grooming_notes: "Soft waves, defined brows, red lips, elegant updo",
      cultural_considerations: "Old Hollywood glamour, sophistication, elegance",
      common_mistakes: ["Too casual", "Modern accessories", "Wrong era items"],
      formality_range: { min: 8, max: 9 }
    },
    "1940s": {
      dress_code_name: "1940s / Wartime Glamour",
      required_elements: ["A-line or tea-length dress", "Structured shoulders", "Modest neckline", "Victory rolls hairstyle"],
      forbidden_elements: ["Modern items", "Jeans", "Trainers", "Contemporary casual wear", "T-shirts"],
      colour_guidance: ["Navy", "Forest green", "Burgundy", "Brown", "Cream", "Red"],
      accessory_guidance: ["Seamed stockings", "Structured handbag", "Hat or headscarf", "Brooch"],
      footwear_guidance: ["Peep-toe heels", "Oxford heels", "Wedges", "Mary Janes"],
      grooming_notes: "Victory rolls, red lips, natural brows, feminine makeup",
      cultural_considerations: "Wartime elegance, make-do-and-mend spirit, practical glamour",
      common_mistakes: ["Modern silhouettes", "Wrong hairstyle", "Anachronistic items"],
      formality_range: { min: 6, max: 8 }
    }
  };

  // Get rules for the specific dress code
  const normalizedCode = event.dress_code.toLowerCase().replace(/-/g, ' ').trim();
  
  // Check for historical era match first
  if (event.is_historical && event.historical_era) {
    const eraCode = event.historical_era.toLowerCase();
    for (const [key, rules] of Object.entries(dressCodeDatabase)) {
      if (eraCode.includes(key) || key.includes(eraCode)) {
        return rules;
      }
    }
  }
  
  // Try exact match
  if (dressCodeDatabase[normalizedCode]) {
    return dressCodeDatabase[normalizedCode];
  }
  
  // Try partial match
  for (const [key, rules] of Object.entries(dressCodeDatabase)) {
    if (normalizedCode.includes(key) || key.includes(normalizedCode)) {
      return rules;
    }
  }
  
  // Default to smart casual
  return dressCodeDatabase["smart casual"];
}

// ============================================
// MODULE 3: WEATHER MODULE
// ============================================

async function getWeatherContext(location: string, date: string, coordinates?: { lat: number; lon: number }): Promise<WeatherContext> {
  const OPENWEATHER_API_KEY = Deno.env.get("OPENWEATHER_API_KEY");
  
  let weatherData: WeatherContext;
  
  try {
    if (coordinates && OPENWEATHER_API_KEY) {
      // Fetch real weather data
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${coordinates.lat}&lon=${coordinates.lon}&appid=${OPENWEATHER_API_KEY}&units=metric`
      );
      
      if (response.ok) {
        const data = await response.json();
        
        const temp = Math.round(data.main.temp);
        const feelsLike = Math.round(data.main.feels_like);
        const humidity = data.main.humidity;
        const windSpeed = Math.round(data.wind?.speed || 0);
        const condition = data.weather[0].main;
        
        weatherData = {
          temperature: temp,
          feels_like: feelsLike,
          condition: condition,
          description: data.weather[0].description,
          humidity: humidity,
          wind_speed: windSpeed,
          layering_needed: temp < 15 || (temp < 20 && windSpeed > 5),
          ground_conditions: getGroundConditions(condition, humidity),
          weather_warnings: getWeatherWarnings(temp, windSpeed, condition, humidity),
          clothing_implications: getClothingImplications(temp, feelsLike, condition, windSpeed, humidity)
        };
        
        return weatherData;
      }
    }
  } catch (error) {
    console.error("Weather API error:", error);
  }
  
  // Fallback to seasonal averages for UK
  return getSeasonalFallback(location, date);
}

function getGroundConditions(condition: string, humidity: number): string {
  const lowerCondition = condition.toLowerCase();
  if (lowerCondition.includes('rain') || lowerCondition.includes('drizzle')) {
    return "Wet - avoid delicate shoes, consider waterproof options";
  }
  if (lowerCondition.includes('snow')) {
    return "Snow/ice - sturdy boots essential, avoid heels";
  }
  if (humidity > 80) {
    return "Damp - may be slippery on grass or polished floors";
  }
  return "Dry - all footwear options suitable";
}

function getWeatherWarnings(temp: number, windSpeed: number, condition: string, humidity: number): string[] {
  const warnings: string[] = [];
  
  if (temp > 28) warnings.push("High temperature - choose breathable fabrics");
  if (temp < 5) warnings.push("Cold temperatures - prioritise warmth");
  if (windSpeed > 10) warnings.push("Strong wind - secure hairstyle, avoid floaty skirts");
  if (condition.toLowerCase().includes('rain')) warnings.push("Rain expected - bring umbrella, water-resistant outerwear");
  if (humidity > 75) warnings.push("High humidity - avoid fabrics that show sweat marks");
  if (condition.toLowerCase().includes('sun') && temp > 20) warnings.push("UV exposure - consider sun protection");
  
  return warnings;
}

function getClothingImplications(temp: number, feelsLike: number, condition: string, windSpeed: number, humidity: number): string[] {
  const implications: string[] = [];
  
  // Temperature-based
  if (feelsLike >= 25) {
    implications.push("Light, breathable fabrics essential");
    implications.push("Avoid layering, opt for single lightweight pieces");
  } else if (feelsLike >= 18) {
    implications.push("Light layers recommended");
    implications.push("Cardigan or light jacket for temperature changes");
  } else if (feelsLike >= 10) {
    implications.push("Warm layers needed");
    implications.push("Consider coat or substantial jacket");
  } else {
    implications.push("Heavy winter wear essential");
    implications.push("Multiple warm layers recommended");
  }
  
  // Condition-based
  if (condition.toLowerCase().includes('rain')) {
    implications.push("Waterproof outer layer advisable");
    implications.push("Protect hair with umbrella or rain-resistant styling");
  }
  
  // Wind-based
  if (windSpeed > 8) {
    implications.push("Avoid loose, flowing pieces that may blow about");
    implications.push("Secure accessories, consider clutch over shoulder bag");
  }
  
  return implications;
}

function getSeasonalFallback(location: string, date: string): WeatherContext {
  // Determine season based on date
  const eventDate = new Date(date);
  const month = eventDate.getMonth(); // 0-11
  
  let seasonData: WeatherContext;
  
  // UK seasonal defaults
  if (month >= 11 || month <= 1) {
    // Winter (Dec, Jan, Feb)
    seasonData = {
      temperature: 6,
      feels_like: 3,
      condition: "Cold",
      description: "Typical UK winter weather",
      humidity: 80,
      wind_speed: 6,
      layering_needed: true,
      ground_conditions: "Potentially wet or icy",
      weather_warnings: ["Cold temperatures expected", "Possible rain - bring umbrella"],
      clothing_implications: ["Warm coat essential", "Layer for indoor/outdoor transitions", "Waterproof footwear recommended"]
    };
  } else if (month >= 2 && month <= 4) {
    // Spring (Mar, Apr, May)
    seasonData = {
      temperature: 12,
      feels_like: 10,
      condition: "Mild",
      description: "Changeable spring weather",
      humidity: 70,
      wind_speed: 5,
      layering_needed: true,
      ground_conditions: "May be damp from spring showers",
      weather_warnings: ["Weather may be changeable", "Rain showers possible"],
      clothing_implications: ["Layers recommended", "Light jacket advisable", "Be prepared for temperature changes"]
    };
  } else if (month >= 5 && month <= 7) {
    // Summer (Jun, Jul, Aug)
    seasonData = {
      temperature: 20,
      feels_like: 21,
      condition: "Warm",
      description: "Pleasant summer weather",
      humidity: 60,
      wind_speed: 3,
      layering_needed: false,
      ground_conditions: "Generally dry",
      weather_warnings: ["UV protection may be needed", "Occasional summer showers possible"],
      clothing_implications: ["Light fabrics recommended", "Sun protection advisable", "Light layer for cooler evenings"]
    };
  } else {
    // Autumn (Sep, Oct, Nov)
    seasonData = {
      temperature: 13,
      feels_like: 11,
      condition: "Cool",
      description: "Typical autumn weather",
      humidity: 75,
      wind_speed: 5,
      layering_needed: true,
      ground_conditions: "May be wet from autumn rain",
      weather_warnings: ["Cooler temperatures", "Rain likely", "Darker evenings"],
      clothing_implications: ["Warm layers essential", "Waterproof outerwear advisable", "Transitional wardrobe needed"]
    };
  }
  
  return seasonData;
}

// ============================================
// MODULE 4: WARDROBE MATCHING
// ============================================

async function matchWardrobe(
  supabase: any,
  userId: string,
  event: InterpretedEvent,
  dressCodeRules: DressCodeRules,
  weather: WeatherContext
): Promise<{ items: WardrobeItem[]; gaps: string[] }> {
  
  // Fetch user's wardrobe
  const { data: wardrobeData, error } = await supabase
    .from('wardrobe_items')
    .select('*')
    .eq('user_id', userId);
  
  if (error) {
    console.error("Wardrobe fetch error:", error);
    return { items: [], gaps: ["Unable to access wardrobe - please add items to your wardrobe"] };
  }
  
  if (!wardrobeData || wardrobeData.length === 0) {
    return { items: [], gaps: ["No wardrobe items found - please add items to your wardrobe"] };
  }
  
  // Analyse and categorise wardrobe items
  const analysedItems: WardrobeItem[] = wardrobeData.map((item: any) => analyseWardrobeItem(item, event, weather));
  
  // Score items for the event
  const scoredItems = analysedItems.map(item => ({
    ...item,
    eventScore: calculateEventScore(item, event, dressCodeRules, weather)
  }));
  
  // Sort by score
  scoredItems.sort((a, b) => b.eventScore - a.eventScore);
  
  // Select best items per category
  const selectedItems: WardrobeItem[] = [];
  const categorySlots = getCategorySlots(event);
  const gaps: string[] = [];
  
  for (const slot of categorySlots) {
    const matchingItems = scoredItems.filter(item => 
      matchesCategory(item.category, slot.category) && 
      item.eventScore >= 50 &&
      !isForbiddenItem(item, dressCodeRules, event)
    );
    
    if (matchingItems.length > 0) {
      selectedItems.push(matchingItems[0]);
    } else {
      gaps.push(slot.description);
    }
  }
  
  return { items: selectedItems, gaps };
}

function analyseWardrobeItem(item: any, event: InterpretedEvent, weather: WeatherContext): WardrobeItem {
  const category = item.category?.toLowerCase() || '';
  const colour = item.color?.toLowerCase() || item.colour?.toLowerCase() || '';
  const tags = item.tags || [];
  
  // Determine seasonality
  const seasonality = determineSeasonality(category, tags, item.name);
  
  // Determine formality level (1-10)
  const formality = determineFormalityLevel(category, item.name, tags, item.brand);
  
  // Determine colour family
  const colourFamily = getColourFamily(colour);
  
  // Calculate weather suitability
  const weatherSuitability = getWeatherSuitability(category, tags, weather);
  
  // Calculate practicality score
  const practicality = calculatePracticality(item, event, weather);
  
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    colour: colour,
    brand: item.brand,
    size: item.size,
    image_url: item.image_url,
    tags: tags,
    seasonality,
    formality_level: formality,
    colour_family: colourFamily,
    practicality_score: practicality,
    weather_suitability: weatherSuitability
  };
}

function determineSeasonality(category: string, tags: string[], name: string): string[] {
  const lower = `${category} ${name} ${tags.join(' ')}`.toLowerCase();
  const seasons: string[] = [];
  
  if (lower.includes('wool') || lower.includes('cashmere') || lower.includes('heavy') || lower.includes('coat') || lower.includes('jumper')) {
    seasons.push('autumn', 'winter');
  }
  if (lower.includes('cotton') || lower.includes('light') || lower.includes('summer') || lower.includes('linen') || lower.includes('sundress')) {
    seasons.push('spring', 'summer');
  }
  if (lower.includes('leather') || lower.includes('denim') || lower.includes('blazer')) {
    seasons.push('spring', 'autumn');
  }
  
  // All-season items
  if (seasons.length === 0 || lower.includes('silk') || lower.includes('dress') || lower.includes('blouse')) {
    seasons.push('spring', 'summer', 'autumn', 'winter');
  }
  
  return [...new Set(seasons)];
}

function determineFormalityLevel(category: string, name: string, tags: string[], brand?: string): number {
  const lower = `${category} ${name} ${tags.join(' ')}`.toLowerCase();
  
  // Very formal items (8-10)
  if (lower.includes('gown') || lower.includes('evening') || lower.includes('tuxedo') || lower.includes('formal')) return 9;
  if (lower.includes('cocktail') || lower.includes('suit')) return 8;
  
  // Smart items (5-7)
  if (lower.includes('blazer') || lower.includes('dress') || lower.includes('heels')) return 7;
  if (lower.includes('blouse') || lower.includes('tailored') || lower.includes('smart')) return 6;
  if (lower.includes('skirt') || lower.includes('trousers')) return 5;
  
  // Casual items (2-4)
  if (lower.includes('jeans') || lower.includes('casual')) return 4;
  if (lower.includes('t-shirt') || lower.includes('trainers')) return 3;
  if (lower.includes('hoodie') || lower.includes('joggers') || lower.includes('sweatshirt')) return 2;
  
  return 5; // Default middle ground
}

function getColourFamily(colour: string): string {
  const lower = colour.toLowerCase();
  
  if (['black', 'charcoal', 'onyx'].some(c => lower.includes(c))) return 'neutral-dark';
  if (['white', 'cream', 'ivory', 'off-white'].some(c => lower.includes(c))) return 'neutral-light';
  if (['grey', 'gray', 'silver'].some(c => lower.includes(c))) return 'neutral';
  if (['navy', 'blue', 'cobalt', 'teal', 'turquoise'].some(c => lower.includes(c))) return 'blue';
  if (['red', 'burgundy', 'wine', 'maroon', 'crimson'].some(c => lower.includes(c))) return 'red';
  if (['green', 'emerald', 'olive', 'sage', 'forest'].some(c => lower.includes(c))) return 'green';
  if (['pink', 'rose', 'blush', 'coral'].some(c => lower.includes(c))) return 'pink';
  if (['purple', 'plum', 'violet', 'lavender'].some(c => lower.includes(c))) return 'purple';
  if (['orange', 'rust', 'terracotta'].some(c => lower.includes(c))) return 'orange';
  if (['yellow', 'gold', 'mustard'].some(c => lower.includes(c))) return 'yellow';
  if (['brown', 'tan', 'camel', 'beige', 'nude'].some(c => lower.includes(c))) return 'earth';
  
  return 'other';
}

function getWeatherSuitability(category: string, tags: string[], weather: WeatherContext): string[] {
  const suitable: string[] = [];
  const lower = category.toLowerCase();
  
  if (weather.temperature >= 20) {
    if (lower.includes('dress') || lower.includes('skirt') || lower.includes('shorts') || lower.includes('sandals')) {
      suitable.push('warm');
    }
  }
  
  if (weather.temperature < 15) {
    if (lower.includes('coat') || lower.includes('jacket') || lower.includes('jumper') || lower.includes('boots')) {
      suitable.push('cold');
    }
  }
  
  if (weather.condition.toLowerCase().includes('rain')) {
    if (tags.some(t => t.toLowerCase().includes('waterproof')) || lower.includes('boot')) {
      suitable.push('rain');
    }
  }
  
  return suitable.length > 0 ? suitable : ['moderate'];
}

function calculatePracticality(item: any, event: InterpretedEvent, weather: WeatherContext): number {
  let score = 70; // Base score
  
  // Activity level adjustment
  if (event.activity_level === 'active') {
    if (item.category?.toLowerCase().includes('heel')) score -= 20;
    if (item.category?.toLowerCase().includes('trainer') || item.category?.toLowerCase().includes('flat')) score += 15;
  }
  
  // Weather adjustment
  if (weather.temperature < 10 && !item.category?.toLowerCase().includes('coat') && !item.category?.toLowerCase().includes('jacket')) {
    score -= 10;
  }
  
  // Indoor/outdoor adjustment
  if (event.indoor_outdoor === 'outdoor' && weather.condition.toLowerCase().includes('rain')) {
    if (!item.tags?.some((t: string) => t.toLowerCase().includes('waterproof'))) {
      score -= 15;
    }
  }
  
  return Math.max(0, Math.min(100, score));
}

function calculateEventScore(item: WardrobeItem, event: InterpretedEvent, rules: DressCodeRules, weather: WeatherContext): number {
  let score = 50;
  
  // Formality match (very important)
  const formalityDiff = Math.abs(item.formality_level - event.formality_level);
  score += Math.max(0, 30 - (formalityDiff * 10));
  
  // Weather suitability
  if (item.weather_suitability.includes('warm') && weather.temperature >= 20) score += 10;
  if (item.weather_suitability.includes('cold') && weather.temperature < 15) score += 10;
  if (item.weather_suitability.includes('rain') && weather.condition.toLowerCase().includes('rain')) score += 10;
  
  // Practicality
  score += (item.practicality_score - 50) / 5;
  
  // Colour appropriateness
  if (rules.colour_guidance.some(c => item.colour_family.includes(c.toLowerCase()) || c.toLowerCase().includes(item.colour_family))) {
    score += 10;
  }
  
  return Math.max(0, Math.min(100, score));
}

function getCategorySlots(event: InterpretedEvent): Array<{ category: string; description: string }> {
  const slots: Array<{ category: string; description: string }> = [];
  
  if (event.formality_level >= 7) {
    // Formal events
    slots.push({ category: 'dress', description: 'Formal dress or gown' });
    slots.push({ category: 'shoes', description: 'Formal footwear' });
    slots.push({ category: 'outerwear', description: 'Evening wrap or coat' });
    slots.push({ category: 'bag', description: 'Evening bag or clutch' });
  } else if (event.formality_level >= 4) {
    // Smart casual
    slots.push({ category: 'top', description: 'Smart top or blouse' });
    slots.push({ category: 'bottom', description: 'Tailored trousers or skirt' });
    slots.push({ category: 'shoes', description: 'Smart shoes' });
    slots.push({ category: 'outerwear', description: 'Blazer or jacket' });
    slots.push({ category: 'bag', description: 'Day bag' });
  } else {
    // Casual
    slots.push({ category: 'top', description: 'Casual top' });
    slots.push({ category: 'bottom', description: 'Casual trousers or jeans' });
    slots.push({ category: 'shoes', description: 'Comfortable footwear' });
    slots.push({ category: 'outerwear', description: 'Casual jacket' });
  }
  
  return slots;
}

function matchesCategory(itemCategory: string, slotCategory: string): boolean {
  const item = itemCategory.toLowerCase();
  const slot = slotCategory.toLowerCase();
  
  const categoryMappings: Record<string, string[]> = {
    'dress': ['dress', 'gown', 'jumpsuit'],
    'top': ['top', 'blouse', 'shirt', 'jumper', 'sweater', 't-shirt'],
    'bottom': ['trousers', 'pants', 'skirt', 'jeans', 'shorts'],
    'shoes': ['shoes', 'heels', 'boots', 'trainers', 'flats', 'sandals', 'loafers'],
    'outerwear': ['coat', 'jacket', 'blazer', 'cardigan'],
    'bag': ['bag', 'clutch', 'purse', 'handbag']
  };
  
  if (categoryMappings[slot]) {
    return categoryMappings[slot].some(cat => item.includes(cat));
  }
  
  return item.includes(slot) || slot.includes(item);
}

function isForbiddenItem(item: WardrobeItem, rules: DressCodeRules, event: InterpretedEvent): boolean {
  const itemStr = `${item.name} ${item.category} ${item.tags?.join(' ')}`.toLowerCase();
  
  // Check forbidden elements
  for (const forbidden of rules.forbidden_elements) {
    if (itemStr.includes(forbidden.toLowerCase())) {
      return true;
    }
  }
  
  // Historical event checks
  if (event.is_historical) {
    const modernItems = ['jeans', 'trainers', 'sneakers', 't-shirt', 'hoodie', 'leggings', 'joggers'];
    if (modernItems.some(modern => itemStr.includes(modern))) {
      return true;
    }
  }
  
  return false;
}

// ============================================
// MODULE 5: PRODUCT SEARCH
// ============================================

async function searchProducts(
  supabase: any,
  event: InterpretedEvent,
  gaps: string[],
  dressCodeRules: DressCodeRules,
  userProfile?: UserProfile
): Promise<{ purchase: ProductResult[]; rental: ProductResult[]; vintage: ProductResult[] }> {
  
  // Fetch from shopping_items table
  const { data: products, error } = await supabase
    .from('shopping_items')
    .select('*')
    .eq('in_stock', true)
    .limit(50);
  
  if (error) {
    console.error("Product search error:", error);
    return { purchase: [], rental: [], vintage: [] };
  }
  
  if (!products || products.length === 0) {
    return { purchase: [], rental: [], vintage: [] };
  }
  
  // Filter and categorise products
  const filteredProducts = products.filter((product: any) => {
    // Filter out forbidden items
    const productStr = `${product.name} ${product.category} ${product.description || ''}`.toLowerCase();
    for (const forbidden of dressCodeRules.forbidden_elements) {
      if (productStr.includes(forbidden.toLowerCase())) {
        return false;
      }
    }
    
    // Historical event filtering
    if (event.is_historical) {
      const modernTerms = ['modern', 'contemporary', 'casual', 'jeans', 'trainer', 'sneaker', 't-shirt', 'hoodie'];
      if (modernTerms.some(term => productStr.includes(term))) {
        return false;
      }
    }
    
    // Budget filtering
    if (userProfile?.budget_max && product.price > userProfile.budget_max) {
      return false;
    }
    
    return true;
  });
  
  // Score and sort products
  const scoredProducts = filteredProducts.map((product: any) => ({
    ...product,
    score: scoreProduct(product, event, dressCodeRules, gaps)
  }));
  
  scoredProducts.sort((a: any, b: any) => b.score - a.score);
  
  // Categorise into purchase, rental, vintage
  const purchase: ProductResult[] = [];
  const rental: ProductResult[] = [];
  const vintage: ProductResult[] = [];
  
  for (const product of scoredProducts.slice(0, 15)) {
    const formatted: ProductResult = {
      id: product.id,
      name: product.name,
      brand: product.brand || 'Unknown Brand',
      price: product.price || 0,
      rental_price: product.rental_price,
      category: product.category,
      colours: product.colors || product.colours || [],
      sizes: product.sizes || [],
      image_url: product.image_url || '',
      retailer_name: product.retailer_name || 'Online Retailer',
      retailer_url: product.retailer_url || '',
      affiliate_url: product.affiliate_url,
      in_stock: product.in_stock,
      source_type: product.rental_price ? 'rental' : 'purchase'
    };
    
    if (product.rental_price) {
      rental.push({ ...formatted, source_type: 'rental' });
    } else {
      purchase.push(formatted);
    }
    
    // Check for vintage indicators
    if (product.name?.toLowerCase().includes('vintage') || product.retailer_name?.toLowerCase().includes('vintage')) {
      vintage.push({ ...formatted, source_type: 'vintage' });
    }
  }
  
  return { purchase: purchase.slice(0, 5), rental: rental.slice(0, 3), vintage: vintage.slice(0, 3) };
}

function scoreProduct(product: any, event: InterpretedEvent, rules: DressCodeRules, gaps: string[]): number {
  let score = 50;
  
  const productStr = `${product.name} ${product.category} ${product.description || ''}`.toLowerCase();
  
  // Boost if fills a gap
  for (const gap of gaps) {
    if (productStr.includes(gap.toLowerCase()) || gap.toLowerCase().includes(product.category?.toLowerCase())) {
      score += 25;
    }
  }
  
  // Boost if matches required elements
  for (const required of rules.required_elements) {
    if (productStr.includes(required.toLowerCase())) {
      score += 15;
    }
  }
  
  // Boost if matches colour guidance
  for (const colour of rules.colour_guidance) {
    if (product.colors?.some((c: string) => c.toLowerCase().includes(colour.toLowerCase()))) {
      score += 10;
    }
  }
  
  return score;
}

// ============================================
// MODULE 6: FINAL STYLING GENERATOR
// ============================================

async function generateFinalStyling(
  event: InterpretedEvent,
  dressCodeRules: DressCodeRules,
  weather: WeatherContext,
  wardrobeResult: { items: WardrobeItem[]; gaps: string[] },
  products: { purchase: ProductResult[]; rental: ProductResult[]; vintage: ProductResult[] },
  userProfile?: UserProfile
): Promise<StylingOutput> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  // Use AI to generate detailed styling notes
  let aiStylingNotes = "";
  
  if (LOVABLE_API_KEY) {
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: event.is_historical ? "openai/gpt-4.1" : "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `You are an expert UK-based personal stylist. Provide specific, actionable styling advice in British English. Be warm but professional. ${event.is_historical ? `This is a ${event.historical_era} themed event - all advice must be period-accurate.` : ''}`
            },
            {
              role: "user",
              content: `Create styling notes for:
Event: ${event.event_type} (${event.dress_code})
Setting: ${event.setting}, ${event.location}
Date/Time: ${event.date}, ${event.time_of_day}
Weather: ${weather.temperature}°C, ${weather.condition}
Wardrobe items available: ${wardrobeResult.items.map(i => i.name).join(', ') || 'None selected'}
Gaps to fill: ${wardrobeResult.gaps.join(', ') || 'None'}

Provide:
1. How to style the wardrobe items together (2-3 sentences)
2. Key etiquette tips for this dress code (3-4 bullet points)
3. Weather-specific adjustments (2-3 points)
4. Practical considerations (transport, comfort, timing)
5. A quick checklist of 5-7 items to remember`
            }
          ]
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        aiStylingNotes = data.choices?.[0]?.message?.content || "";
      }
    } catch (error) {
      console.error("AI styling generation error:", error);
    }
  }
  
  // Build final output
  const output: StylingOutput = {
    event_summary: {
      interpreted_event: event,
      weather_summary: `${weather.temperature}°C, ${weather.condition}. ${weather.layering_needed ? 'Layering recommended.' : 'Light clothing suitable.'}`,
      key_considerations: [
        ...weather.weather_warnings,
        ...dressCodeRules.common_mistakes.map(m => `Avoid: ${m}`)
      ]
    },
    etiquette_guidance: {
      dress_code_explanation: `${dressCodeRules.dress_code_name}: ${dressCodeRules.cultural_considerations}`,
      do_list: dressCodeRules.required_elements,
      dont_list: dressCodeRules.forbidden_elements,
      cultural_notes: dressCodeRules.grooming_notes
    },
    wardrobe_outfit: {
      items: wardrobeResult.items,
      styling_notes: aiStylingNotes || "Style your selected pieces together for a cohesive look that matches the dress code.",
      gaps_identified: wardrobeResult.gaps
    },
    shopping_options: {
      purchase_items: products.purchase,
      rental_items: products.rental,
      vintage_items: products.vintage,
      total_purchase_cost: products.purchase.reduce((sum, p) => sum + (p.price || 0), 0),
      total_rental_cost: products.rental.reduce((sum, p) => sum + (p.rental_price || 0), 0)
    },
    accessories: {
      recommended: dressCodeRules.accessory_guidance,
      from_wardrobe: wardrobeResult.items.filter(i => i.category.toLowerCase().includes('accessories') || i.category.toLowerCase().includes('bag') || i.category.toLowerCase().includes('jewellery')),
      to_purchase: products.purchase.filter(p => p.category.toLowerCase().includes('accessories'))
    },
    weather_adjustments: {
      layering_strategy: weather.layering_needed ? "Add a smart outer layer that can be removed indoors." : "Single layers should suffice.",
      protection_items: weather.condition.toLowerCase().includes('rain') ? ["Umbrella", "Water-resistant outerwear"] : [],
      backup_plan: weather.condition.toLowerCase().includes('rain') ? "Have a taxi/Uber ready to avoid getting caught in rain." : "No weather backup needed."
    },
    practical_considerations: {
      comfort_tips: [
        event.activity_level === 'active' ? "Choose comfortable footwear for movement" : "Heels are suitable for this event",
        event.duration_hours && event.duration_hours > 4 ? "Consider shoes you can stand in for extended periods" : "Duration is manageable",
        ...weather.clothing_implications
      ],
      transport_notes: event.setting.toLowerCase().includes('outdoor') ? "Consider footwear suitable for the terrain" : "Standard footwear appropriate",
      venue_considerations: event.environment_notes,
      time_of_day_adjustments: event.time_of_day === 'evening' ? "Metallic accents and jewellery catch the light beautifully at evening events." : "Natural fabrics and lighter colours work well in daylight."
    },
    checklist: generateChecklist(event, dressCodeRules, weather, wardrobeResult, products),
    confidence_score: calculateConfidenceScore(wardrobeResult, products, event),
    validation_notes: []
  };
  
  return output;
}

function generateChecklist(
  event: InterpretedEvent,
  rules: DressCodeRules,
  weather: WeatherContext,
  wardrobe: { items: WardrobeItem[]; gaps: string[] },
  products: { purchase: ProductResult[]; rental: ProductResult[]; vintage: ProductResult[] }
): string[] {
  const checklist: string[] = [];
  
  // Core outfit items
  if (wardrobe.items.length > 0) {
    checklist.push(`✓ ${wardrobe.items.map(i => i.name).slice(0, 3).join(', ')}`);
  }
  
  // Shopping/rental items to acquire
  if (wardrobe.gaps.length > 0 && products.purchase.length > 0) {
    checklist.push(`☐ Purchase/rent: ${wardrobe.gaps.slice(0, 2).join(', ')}`);
  }
  
  // Accessories
  checklist.push(`☐ Accessories: ${rules.accessory_guidance.slice(0, 2).join(', ')}`);
  
  // Footwear
  checklist.push(`☐ Footwear: ${rules.footwear_guidance[0]}`);
  
  // Weather items
  if (weather.condition.toLowerCase().includes('rain')) {
    checklist.push("☐ Umbrella");
  }
  if (weather.layering_needed) {
    checklist.push("☐ Smart outer layer");
  }
  
  // Grooming
  checklist.push(`☐ Grooming: ${rules.grooming_notes.split(',')[0]}`);
  
  // Practical
  checklist.push("☐ Fully charged phone");
  checklist.push("☐ Check transport/parking");
  
  return checklist;
}

function calculateConfidenceScore(
  wardrobe: { items: WardrobeItem[]; gaps: string[] },
  products: { purchase: ProductResult[]; rental: ProductResult[]; vintage: ProductResult[] },
  event: InterpretedEvent
): number {
  let score = 60; // Base score
  
  // Wardrobe coverage
  if (wardrobe.items.length >= 3) score += 15;
  else if (wardrobe.items.length >= 1) score += 8;
  
  // Gaps filled
  if (wardrobe.gaps.length === 0) score += 15;
  else if (products.purchase.length + products.rental.length >= wardrobe.gaps.length) score += 10;
  
  // Event clarity
  if (event.dress_code && event.dress_code !== 'unknown') score += 5;
  if (event.location && event.location !== 'unknown') score += 5;
  
  return Math.min(100, score);
}

// ============================================
// MODULE 7: VALIDATION LAYER
// ============================================

function validateOutput(output: StylingOutput, event: InterpretedEvent, dressCodeRules: DressCodeRules): StylingOutput {
  const validationNotes: string[] = [];
  
  // Validate dress code compliance
  for (const item of output.wardrobe_outfit.items) {
    const itemStr = `${item.name} ${item.category}`.toLowerCase();
    for (const forbidden of dressCodeRules.forbidden_elements) {
      if (itemStr.includes(forbidden.toLowerCase())) {
        validationNotes.push(`Warning: ${item.name} may not be appropriate for ${dressCodeRules.dress_code_name}`);
      }
    }
  }
  
  // Validate historical accuracy
  if (event.is_historical) {
    const modernItems = ['jeans', 'trainers', 'sneakers', 't-shirt', 'hoodie', 'leggings'];
    for (const item of output.wardrobe_outfit.items) {
      const itemStr = `${item.name} ${item.category}`.toLowerCase();
      if (modernItems.some(m => itemStr.includes(m))) {
        validationNotes.push(`Warning: ${item.name} is a modern item not suitable for ${event.historical_era} theme`);
      }
    }
  }
  
  // Validate seasonality
  const currentMonth = new Date().getMonth();
  const season = currentMonth >= 11 || currentMonth <= 1 ? 'winter' : 
                 currentMonth >= 2 && currentMonth <= 4 ? 'spring' :
                 currentMonth >= 5 && currentMonth <= 7 ? 'summer' : 'autumn';
  
  for (const item of output.wardrobe_outfit.items) {
    if (item.seasonality && !item.seasonality.includes(season)) {
      validationNotes.push(`Note: ${item.name} is typically ${item.seasonality.join('/')} wear`);
    }
  }
  
  // Validate practicality
  if (event.activity_level === 'active') {
    for (const item of output.wardrobe_outfit.items) {
      if (item.category.toLowerCase().includes('heel') && !item.category.toLowerCase().includes('block')) {
        validationNotes.push(`Consideration: High heels may not be practical for an active event`);
      }
    }
  }
  
  // Validate product links exist
  for (const product of [...output.shopping_options.purchase_items, ...output.shopping_options.rental_items]) {
    if (!product.retailer_url && !product.affiliate_url) {
      validationNotes.push(`Note: ${product.name} - no link available, search "${product.brand} ${product.name}"`);
    }
  }
  
  output.validation_notes = validationNotes;
  
  return output;
}

// ============================================
// MAIN WORKFLOW ORCHESTRATOR
// ============================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userPrompt, userId, userLocation, userProfile }: WorkflowInput = await req.json();
    
    console.log(`[Workflow] Starting for user ${userId}: "${userPrompt}"`);
    
    // Initialise Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Step 1: Interpret the event
    console.log("[Module 1] Interpreting event...");
    const event = await interpretEvent(userPrompt);
    console.log("[Module 1] Event interpreted:", event.event_type, event.dress_code);
    
    // Step 2: Get dress code rules
    console.log("[Module 2] Applying dress code rules...");
    const dressCodeRules = getDressCodeRules(event);
    console.log("[Module 2] Dress code rules applied:", dressCodeRules.dress_code_name);
    
    // Step 3: Get weather context
    console.log("[Module 3] Fetching weather...");
    const weather = await getWeatherContext(event.location, event.date, userLocation);
    console.log("[Module 3] Weather fetched:", weather.temperature + "°C", weather.condition);
    
    // Step 4: Match wardrobe
    console.log("[Module 4] Matching wardrobe...");
    const wardrobeResult = await matchWardrobe(supabase, userId, event, dressCodeRules, weather);
    console.log("[Module 4] Wardrobe matched:", wardrobeResult.items.length, "items,", wardrobeResult.gaps.length, "gaps");
    
    // Step 5: Search products
    console.log("[Module 5] Searching products...");
    const products = await searchProducts(supabase, event, wardrobeResult.gaps, dressCodeRules, userProfile);
    console.log("[Module 5] Products found:", products.purchase.length, "purchase,", products.rental.length, "rental");
    
    // Step 6: Generate final styling
    console.log("[Module 6] Generating final styling...");
    const styling = await generateFinalStyling(event, dressCodeRules, weather, wardrobeResult, products, userProfile);
    
    // Step 7: Validate output
    console.log("[Module 7] Validating output...");
    const validatedOutput = validateOutput(styling, event, dressCodeRules);
    console.log("[Module 7] Validation complete:", validatedOutput.validation_notes.length, "notes");
    
    console.log(`[Workflow] Complete. Confidence: ${validatedOutput.confidence_score}%`);
    
    return new Response(JSON.stringify({
      success: true,
      data: validatedOutput
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Workflow] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
