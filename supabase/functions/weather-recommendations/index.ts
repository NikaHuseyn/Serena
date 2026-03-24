import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function getClothingRecommendations(temp: number, condition: string, windSpeed: number, humidity: number): string[] {
  const lower = condition.toLowerCase();
  const isRainy = lower.includes('rain') || lower.includes('drizzle') || lower.includes('thunderstorm');
  const isSnowy = lower.includes('snow');
  const isWindy = windSpeed > 8;

  if (temp >= 28) {
    const recs = ['Light linen shirt', 'Breathable cotton shorts', 'Comfortable sandals', 'Sunglasses', 'Sun hat'];
    if (humidity > 70) recs.push('Moisture-wicking fabrics');
    if (isRainy) recs.push('Compact umbrella');
    return recs;
  } else if (temp >= 20) {
    const recs = ['Light cotton top', 'Chinos or light trousers', 'Casual trainers', 'Light cardigan for evenings'];
    if (isRainy) recs.push('Waterproof jacket');
    if (isWindy) recs.push('Windbreaker');
    return recs;
  } else if (temp >= 12) {
    const recs = ['Layered outfit', 'Light jacket or blazer', 'Jeans or trousers', 'Closed-toe shoes', 'Light scarf'];
    if (isRainy) recs.push('Waterproof coat');
    if (isWindy) recs.push('Wind-resistant layer');
    return recs;
  } else if (temp >= 5) {
    const recs = ['Warm coat', 'Jumper or sweater', 'Warm trousers', 'Boots', 'Scarf & gloves'];
    if (isRainy) recs.push('Waterproof outer layer');
    return recs;
  } else {
    const recs = ['Heavy winter coat', 'Thermal layers', 'Warm boots', 'Thick scarf', 'Insulated gloves', 'Warm hat'];
    if (isSnowy) recs.push('Waterproof snow boots');
    return recs;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lat, lon, location, forecastDate } = await req.json();

    const openWeatherApiKey = Deno.env.get('OPENWEATHER_API_KEY');
    if (!openWeatherApiKey) {
      throw new Error('Missing OPENWEATHER_API_KEY');
    }

    // Determine coordinates: either from params or geocode a location string
    let resolvedLat = lat;
    let resolvedLon = lon;
    let resolvedLocationName = '';

    if (location && !lat && !lon) {
      // Geocode the location string using OpenWeatherMap geocoding API
      console.log('Geocoding location:', location);
      const geoResponse = await fetch(
        `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${openWeatherApiKey}`
      );

      if (!geoResponse.ok) {
        throw new Error('Failed to geocode location');
      }

      const geoData = await geoResponse.json();
      if (!geoData || geoData.length === 0) {
        // Location string is not a real place (e.g. "Black tie") — fall back to London
        console.warn(`Could not geocode "${location}", falling back to London defaults`);
        resolvedLat = 51.5074;
        resolvedLon = -0.1278;
        resolvedLocationName = 'London, GB';
      } else {
        resolvedLat = geoData[0].lat;
        resolvedLon = geoData[0].lon;
        resolvedLocationName = geoData[0].name + (geoData[0].country ? `, ${geoData[0].country}` : '');
        console.log(`Geocoded "${location}" → ${resolvedLat}, ${resolvedLon} (${resolvedLocationName})`);
      }
    }

    if (resolvedLat == null || resolvedLon == null) {
      throw new Error('Either lat/lon or location string is required');
    }

    // Determine if we need forecast or current weather
    const isForecast = !!forecastDate;
    let temperature: number;
    let condition: string;
    let humidity: number;
    let windSpeed: number;
    let description: string;
    let feelsLike: number;
    let locationLabel: string;
    let forecastDay: string | null = null;

    if (isForecast) {
      // Use OpenWeatherMap 5-day/3-hour forecast (free tier)
      // For dates beyond 5 days, we'll still try and fall back to current
      console.log('Fetching forecast for date:', forecastDate);
      const forecastResponse = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${resolvedLat}&lon=${resolvedLon}&appid=${openWeatherApiKey}&units=metric`
      );

      if (!forecastResponse.ok) {
        throw new Error('Failed to fetch forecast data');
      }

      const forecastData = await forecastResponse.json();
      locationLabel = resolvedLocationName || `${forecastData.city?.name || 'Unknown'}, ${forecastData.city?.country || ''}`;

      // Find the forecast entry closest to midday on the target date
      const targetDate = forecastDate; // YYYY-MM-DD
      const targetMidday = `${targetDate} 12:00:00`;

      let bestEntry = null;
      let bestDiff = Infinity;

      for (const entry of forecastData.list || []) {
        if (entry.dt_txt?.startsWith(targetDate)) {
          const diff = Math.abs(new Date(entry.dt_txt).getTime() - new Date(targetMidday).getTime());
          if (diff < bestDiff) {
            bestDiff = diff;
            bestEntry = entry;
          }
        }
      }

      if (bestEntry) {
        temperature = Math.round(bestEntry.main.temp);
        condition = bestEntry.weather[0].main;
        humidity = bestEntry.main.humidity;
        windSpeed = Math.round(bestEntry.wind?.speed || 0);
        description = bestEntry.weather[0].description;
        feelsLike = Math.round(bestEntry.main.feels_like);
        forecastDay = targetDate;
      } else {
        // Target date outside forecast range — fall back to current weather
        console.log('Forecast date outside range, falling back to current weather');
        const currentData = await fetchCurrentWeather(resolvedLat, resolvedLon, openWeatherApiKey);
        temperature = currentData.temperature;
        condition = currentData.condition;
        humidity = currentData.humidity;
        windSpeed = currentData.windSpeed;
        description = currentData.description;
        feelsLike = currentData.feelsLike;
        locationLabel = resolvedLocationName || currentData.locationLabel;
      }
    } else {
      // Current weather
      const currentData = await fetchCurrentWeather(resolvedLat, resolvedLon, openWeatherApiKey);
      temperature = currentData.temperature;
      condition = currentData.condition;
      humidity = currentData.humidity;
      windSpeed = currentData.windSpeed;
      description = currentData.description;
      feelsLike = currentData.feelsLike;
      locationLabel = resolvedLocationName || currentData.locationLabel;
    }

    const result = {
      temperature,
      condition,
      humidity,
      windSpeed,
      location: locationLabel,
      description,
      feelsLike,
      forecastDate: forecastDay,
      clothingRecommendations: getClothingRecommendations(temperature, condition, windSpeed, humidity),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in weather-recommendations function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchCurrentWeather(lat: number, lon: number, apiKey: string) {
  const weatherResponse = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`
  );

  if (!weatherResponse.ok) {
    throw new Error('Failed to fetch weather data');
  }

  const weatherData = await weatherResponse.json();
  return {
    temperature: Math.round(weatherData.main.temp),
    condition: weatherData.weather[0].main,
    humidity: weatherData.main.humidity,
    windSpeed: Math.round(weatherData.wind?.speed || 0),
    description: weatherData.weather[0].description,
    feelsLike: Math.round(weatherData.main.feels_like),
    locationLabel: `${weatherData.name}, ${weatherData.sys.country}`,
  };
}
