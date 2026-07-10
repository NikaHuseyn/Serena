import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Fallback hex lookup for common colour names the analysis produces.
// Used when the model returns a missing / malformed / near-white / near-grey hex
// that doesn't plausibly match the colour name.
const COLOUR_FALLBACK: Record<string, string> = {
  black: "#000000", white: "#ffffff", ivory: "#fffff0", cream: "#fffdd0",
  "warm white": "#faf0e6", "off-white": "#f5f5f0", "icy white": "#f5fbff",
  beige: "#e6d5b8", camel: "#c19a6b", tan: "#d2b48c", khaki: "#c3b091",
  taupe: "#8b7d6b", stone: "#a89f8e", sand: "#c2b280",
  brown: "#6b4423", "chocolate brown": "#3d2314", chocolate: "#4b2e1f",
  espresso: "#3b271c", "warm brown": "#7a4a2a", mahogany: "#6b2f1a",
  charcoal: "#36454f", slate: "#556877", "cool grey": "#8a9099",
  gray: "#6b7280", grey: "#6b7280", silver: "#c0c0c0",
  navy: "#0a1a3a", "midnight blue": "#0a0f2c", "deep blue": "#00246b",
  "cobalt blue": "#0047ab", "royal blue": "#2a4fc8", "true blue": "#0f52ba",
  blue: "#2563eb", "sky blue": "#5fb0e8", "powder blue": "#a8ccd7",
  "icy blue": "#c8e8f2", "baby blue": "#a7c7e7", periwinkle: "#8a9ee0",
  teal: "#0d8a8a", "deep teal": "#0a5f6e", turquoise: "#2ec4b6", aqua: "#3ec7c7",
  "emerald green": "#00754a", emerald: "#00754a", "forest green": "#0f4d2a",
  "olive green": "#6b6a1e", olive: "#6b6a1e", "sage green": "#94a37a",
  sage: "#94a37a", mint: "#8ed4a2", "mint green": "#8ed4a2",
  "kelly green": "#2ea44f", "grass green": "#2ea44f", green: "#1f9d55",
  "hunter green": "#0f4a2f", "lime green": "#96d43a",
  yellow: "#f5c518", "warm yellow": "#f0b429", mustard: "#c99a2e",
  "golden yellow": "#e8a83a", gold: "#c9a227", "buttery yellow": "#f5df7a",
  orange: "#e8742b", "burnt orange": "#b8541a", "warm orange": "#dc6a1f",
  peach: "#f2b58e", apricot: "#e89a63", coral: "#f26a5a", "warm coral": "#eb5a45",
  salmon: "#e88a75", terracotta: "#c85a3a", rust: "#a54a24", "brick red": "#9a2f1e",
  red: "#c8202b", "tomato red": "#dc3226", "true red": "#c8202b",
  "cherry red": "#c41e3a", "warm red": "#c8322a", crimson: "#9c1c2e",
  burgundy: "#5c1626", wine: "#5c1a2a", maroon: "#5a1a20", oxblood: "#4a1218",
  pink: "#e6598a", "hot pink": "#e8358a", "shocking pink": "#e83596",
  "soft pink": "#f5b8c8", "blush pink": "#f2c5cc", "dusty pink": "#d59aa2",
  "dusty rose": "#c58a92", rose: "#e04a72", "warm pink": "#e6608a",
  fuchsia: "#e024a8", magenta: "#c026a2", raspberry: "#b21e5e",
  plum: "#5c2a54", "deep plum": "#3e1a3a", aubergine: "#3a1e3a",
  eggplant: "#472a48", purple: "#6a2ca0", violet: "#7a3ec4",
  lavender: "#bfa8d9", lilac: "#c8b0e0", mauve: "#a97fa5", orchid: "#c060c0",
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

function isRealColourWord(name: string): boolean {
  const n = name.toLowerCase().trim();
  // Any known token match => real colour word
  if (COLOUR_FALLBACK[n]) return true;
  return n.split(/\s+/).some((w) => COLOUR_FALLBACK[w]);
}

function fallbackHexFor(name: string): string | null {
  const n = name.toLowerCase().trim();
  if (COLOUR_FALLBACK[n]) return COLOUR_FALLBACK[n];
  const words = n.split(/\s+/);
  for (const w of words) if (COLOUR_FALLBACK[w]) return COLOUR_FALLBACK[w];
  return null;
}

function needsFallback(hex: string | undefined | null, name: string): boolean {
  if (!hex) return isRealColourWord(name);
  const rgb = hexToRgb(hex);
  if (!rgb) return isRealColourWord(name);
  const [r, g, b] = rgb;
  const nearWhite = r > 220 && g > 220 && b > 220;
  const nearGrey = Math.abs(r - g) <= 15 && Math.abs(g - b) <= 15 && Math.abs(r - b) <= 15;
  const nameLower = name.toLowerCase();
  const nameAllowsNeutral =
    /white|grey|gray|silver|ivory|cream|stone|off|ash|charcoal|black/.test(nameLower);
  if ((nearWhite || nearGrey) && !nameAllowsNeutral && isRealColourWord(name)) return true;
  return false;
}

function sanitiseColourList(list: any): Array<{ name: string; hex: string }> {
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => {
      const name = typeof c?.name === "string" ? c.name : "";
      let hex = typeof c?.hex === "string" ? c.hex : "";
      if (!hex.startsWith("#")) hex = "#" + hex.replace(/^#/, "");
      if (needsFallback(hex, name)) {
        const fb = fallbackHexFor(name);
        if (fb) hex = fb;
      }
      return { name, hex };
    })
    .filter((c) => c.name);
}

// ============================================================================
// SEASON_PALETTES — canonical 12-season colour analysis palettes
// Drop-in constant for supabase/functions/color-analysis/index.ts
// Assembled from standard professional colour-analysis references.
// Each season: ~30 best colours grouped (neutrals / accents / statements)
// + ~10 colours to avoid. The AI decides the SEASON; these palettes are
// the fixed, professional answer for what that season wears.
// ============================================================================

export const SEASON_PALETTES: Record<string, {
  description: string;
  neutrals: { name: string; hex: string }[];
  accents: { name: string; hex: string }[];
  statements: { name: string; hex: string }[];
  avoid: { name: string; hex: string }[];
}> = {

  "Light Spring": {
    description: "Light, warm and fresh — delicate colours with a sunlit clarity.",
    neutrals: [
      { name: "Ivory", hex: "#FFF8E7" }, { name: "Cream", hex: "#F5F0DC" },
      { name: "Light Camel", hex: "#C8A97E" }, { name: "Soft Beige", hex: "#E8DCC8" },
      { name: "Light Warm Grey", hex: "#CFC8BC" }, { name: "Sand", hex: "#DBC9A8" },
      { name: "Pale Taupe", hex: "#C9BBA8" }, { name: "Milk Chocolate", hex: "#9C7A5B" },
    ],
    accents: [
      { name: "Peach", hex: "#FFCBA4" }, { name: "Apricot", hex: "#FBAE7E" },
      { name: "Coral Pink", hex: "#F88379" }, { name: "Warm Pink", hex: "#F4A6A3" },
      { name: "Light Aqua", hex: "#9BD4CF" }, { name: "Clear Turquoise", hex: "#5FC9C4" },
      { name: "Fresh Green", hex: "#9BC97E" }, { name: "Light Leaf Green", hex: "#A8D08D" },
      { name: "Cornflower", hex: "#8FA9DB" }, { name: "Light Periwinkle", hex: "#A9B7E0" },
      { name: "Buttercream Yellow", hex: "#F7E39A" }, { name: "Warm Lilac", hex: "#C6A9D6" },
    ],
    statements: [
      { name: "Bright Coral", hex: "#FF6F61" }, { name: "Watermelon", hex: "#F05C6E" },
      { name: "Clear Warm Red", hex: "#E8503A" }, { name: "Sunny Yellow", hex: "#FFD34E" },
      { name: "Kelly-Light Green", hex: "#63B76C" }, { name: "Bright Aqua", hex: "#2FC1BE" },
      { name: "Golden Tan", hex: "#D9A75F" }, { name: "Salmon", hex: "#FA8A6B" },
    ],
    avoid: [
      { name: "Black", hex: "#000000" }, { name: "Charcoal", hex: "#36454F" },
      { name: "Burgundy", hex: "#6D2233" }, { name: "Deep Plum", hex: "#4E2A5A" },
      { name: "Cool Fuchsia", hex: "#C7247B" }, { name: "Icy Blue", hex: "#BFD7EA" },
      { name: "Dusty Rose", hex: "#B58B8B" }, { name: "Olive Drab", hex: "#6B6B47" },
      { name: "Dark Navy", hex: "#1B2A4A" }, { name: "Ash Grey", hex: "#9BA3A8" },
    ],
  },

  "True Spring": {
    description: "Warm and clear — golden, vivid colours with no grey in them.",
    neutrals: [
      { name: "Ivory", hex: "#FFF6E3" }, { name: "Warm Cream", hex: "#F7EBD0" },
      { name: "Camel", hex: "#B9905F" }, { name: "Golden Beige", hex: "#E0C79A" },
      { name: "Light Warm Brown", hex: "#A97E50" }, { name: "Bronze", hex: "#9C7644" },
      { name: "Khaki Tan", hex: "#C4AD7D" }, { name: "Golden Brown", hex: "#8B5F2F" },
    ],
    accents: [
      { name: "Coral", hex: "#FF7F50" }, { name: "Peach", hex: "#FFB07C" },
      { name: "Warm Turquoise", hex: "#30C6B8" }, { name: "Clear Aqua", hex: "#3EC1D3" },
      { name: "Leaf Green", hex: "#71B340" }, { name: "Apple Green", hex: "#8DB600" },
      { name: "Golden Yellow", hex: "#FFC93C" }, { name: "Marigold", hex: "#F2A104" },
      { name: "Periwinkle Blue", hex: "#7C9ED9" }, { name: "Violet", hex: "#8E6BBF" },
      { name: "Warm Pink", hex: "#F97D8B" }, { name: "Salmon", hex: "#F78D6C" },
    ],
    statements: [
      { name: "Poppy Red", hex: "#E8402A" }, { name: "Tomato Red", hex: "#E4572E" },
      { name: "Bright Coral Red", hex: "#FF4F42" }, { name: "Kelly Green", hex: "#4CBB17" },
      { name: "Bright Turquoise", hex: "#0AC5C5" }, { name: "Saffron", hex: "#F4A900" },
      { name: "Hot Coral Pink", hex: "#FF5E78" }, { name: "Clear Orange", hex: "#F97B22" },
    ],
    avoid: [
      { name: "Black", hex: "#000000" }, { name: "Pure White", hex: "#FFFFFF" },
      { name: "Burgundy", hex: "#6D2233" }, { name: "Mauve", hex: "#B784A7" },
      { name: "Dusty Blue", hex: "#8CA6BE" }, { name: "Cool Grey", hex: "#A6ADB4" },
      { name: "Icy Pink", hex: "#F1D6E0" }, { name: "Deep Plum", hex: "#4E2A5A" },
      { name: "Muted Sage", hex: "#9AA88A" }, { name: "Slate", hex: "#5B6770" },
    ],
  },

  "Bright Spring": {
    description: "Warm-leaning and highly saturated — the most vivid of the warm seasons.",
    neutrals: [
      { name: "Ivory", hex: "#FFF7E8" }, { name: "Light Camel", hex: "#C8A97E" },
      { name: "Warm Taupe", hex: "#B3A08A" }, { name: "Golden Beige", hex: "#E3CCA0" },
      { name: "Bright Navy", hex: "#1F3A93" }, { name: "Warm Charcoal", hex: "#4A4441" },
      { name: "Chocolate", hex: "#6B4226" }, { name: "Stone", hex: "#D8CFC0" },
    ],
    accents: [
      { name: "Coral", hex: "#FF6F61" }, { name: "Hot Pink (warm)", hex: "#FF4E78" },
      { name: "Turquoise", hex: "#17C3B2" }, { name: "Bright Aqua", hex: "#00C2D1" },
      { name: "Apple Green", hex: "#7FBF2A" }, { name: "Emerald (clear)", hex: "#2AA876" },
      { name: "Golden Yellow", hex: "#FFC61A" }, { name: "Tangerine", hex: "#F98125" },
      { name: "Violet", hex: "#7C53C3" }, { name: "Bright Periwinkle", hex: "#6C7FE0" },
      { name: "Watermelon", hex: "#F4426E" }, { name: "Clear Salmon", hex: "#FF8A66" },
    ],
    statements: [
      { name: "True Red (warm)", hex: "#E0281C" }, { name: "Flame Orange", hex: "#FF5C1F" },
      { name: "Electric Turquoise", hex: "#00D1CB" }, { name: "Fuchsia (warm)", hex: "#E82D7C" },
      { name: "Lime", hex: "#B4D62A" }, { name: "Bright Cobalt", hex: "#2456E5" },
      { name: "Canary Yellow", hex: "#FFD500" }, { name: "Vivid Coral", hex: "#FF4040" },
    ],
    avoid: [
      { name: "Dusty Rose", hex: "#B58B8B" }, { name: "Muted Sage", hex: "#9AA88A" },
      { name: "Taupe Grey", hex: "#8B8589" }, { name: "Soft Mauve", hex: "#B98CA6" },
      { name: "Olive Drab", hex: "#6B6B47" }, { name: "Powder Blue", hex: "#B7CBDD" },
      { name: "Oatmeal", hex: "#D6CBB4" }, { name: "Ash Brown", hex: "#8A7B6F" },
      { name: "Charcoal (soft)", hex: "#55575A" }, { name: "Antique Rose", hex: "#C79A9A" },
    ],
  },

  "Light Summer": {
    description: "Light, cool and gentle — misty pastels with a soft coolness.",
    neutrals: [
      { name: "Soft White", hex: "#F7F5F2" }, { name: "Light Grey", hex: "#D5D8DC" },
      { name: "Dove Grey", hex: "#BFC4CB" }, { name: "Cool Beige", hex: "#DCD3C6" },
      { name: "Rose Beige", hex: "#D9C4BB" }, { name: "Light Navy", hex: "#4A5D82" },
      { name: "Greyed Taupe", hex: "#B5ABA0" }, { name: "Cocoa Rose", hex: "#9C8078" },
    ],
    accents: [
      { name: "Powder Blue", hex: "#AFC9E1" }, { name: "Sky Blue", hex: "#8DB6D9" },
      { name: "Rose Pink", hex: "#E8A7B4" }, { name: "Petal Pink", hex: "#F2C4CE" },
      { name: "Lavender", hex: "#B6A6D4" }, { name: "Wisteria", hex: "#A48FC4" },
      { name: "Seafoam", hex: "#A8D5C6" }, { name: "Soft Aqua", hex: "#95C9C4" },
      { name: "Dusty Lemon", hex: "#EFE49B" }, { name: "Heather", hex: "#9E8FB2" },
      { name: "Light Raspberry", hex: "#D77A93" }, { name: "Cool Mint", hex: "#B4DDD0" },
    ],
    statements: [
      { name: "Soft Fuchsia", hex: "#D45D93" }, { name: "Watermelon Rose", hex: "#DE5D74" },
      { name: "Periwinkle", hex: "#7A8FD1" }, { name: "Clear Soft Blue", hex: "#5C93CE" },
      { name: "Orchid", hex: "#B57ABF" }, { name: "Raspberry (light)", hex: "#C4497C" },
      { name: "Jade (soft)", hex: "#5FAF98" }, { name: "Cool Rose Red", hex: "#CC4E63" },
    ],
    avoid: [
      { name: "Black", hex: "#000000" }, { name: "Orange", hex: "#F97B22" },
      { name: "Mustard", hex: "#D6A319" }, { name: "Rust", hex: "#B7410E" },
      { name: "Warm Camel", hex: "#B9905F" }, { name: "Olive", hex: "#6B8E23" },
      { name: "Tomato Red", hex: "#E4572E" }, { name: "Golden Brown", hex: "#8B5F2F" },
      { name: "Bright Yellow", hex: "#FFD500" }, { name: "Chocolate", hex: "#5D3A1A" },
    ],
  },

  "True Summer": {
    description: "Cool and soft — blue-based colours with a gentle, muted elegance.",
    neutrals: [
      { name: "Soft White", hex: "#F5F4F0" }, { name: "Grey", hex: "#9EA5AD" },
      { name: "Charcoal Blue", hex: "#4C5866" }, { name: "Greyed Navy", hex: "#39465E" },
      { name: "Cool Taupe", hex: "#A99F97" }, { name: "Rose Brown", hex: "#8D6E6B" },
      { name: "Slate", hex: "#5B6770" }, { name: "Cool Stone", hex: "#C7C4BC" },
    ],
    accents: [
      { name: "Cornflower Blue", hex: "#6A8CC7" }, { name: "Denim Blue", hex: "#4E6E9E" },
      { name: "Dusty Rose", hex: "#C48793" }, { name: "Mauve", hex: "#A87E9F" },
      { name: "Soft Teal", hex: "#4E8E88" }, { name: "Blue Green", hex: "#3D8C84" },
      { name: "Lavender Grey", hex: "#9C93B5" }, { name: "Powder Pink", hex: "#E3B5C0" },
      { name: "Cadet Blue", hex: "#5F9EA0" }, { name: "Plum Rose", hex: "#8E5C74" },
      { name: "Muted Raspberry", hex: "#B04A6F" }, { name: "Hydrangea", hex: "#7D9BC1" },
    ],
    statements: [
      { name: "Raspberry", hex: "#B3315F" }, { name: "Soft Fuchsia", hex: "#C2549A" },
      { name: "Blueberry", hex: "#4A63A8" }, { name: "Watermelon (cool)", hex: "#D45568" },
      { name: "Amethyst", hex: "#8A63AD" }, { name: "Deep Rose", hex: "#B04E63" },
      { name: "Teal", hex: "#2E7F82" }, { name: "Cool Emerald", hex: "#2E8464" },
    ],
    avoid: [
      { name: "Black", hex: "#000000" }, { name: "Orange", hex: "#F97B22" },
      { name: "Golden Yellow", hex: "#FFC93C" }, { name: "Rust", hex: "#B7410E" },
      { name: "Camel", hex: "#B9905F" }, { name: "Warm Olive", hex: "#7A7A2F" },
      { name: "Tomato Red", hex: "#E4572E" }, { name: "Bright Turquoise", hex: "#0AC5C5" },
      { name: "Cream Gold", hex: "#EBD8A4" }, { name: "Copper", hex: "#B87333" },
    ],
  },

  "Soft Summer": {
    description: "Muted, cool-neutral and blended — the gentlest, mistiest palette.",
    neutrals: [
      { name: "Soft White", hex: "#F3F1EC" }, { name: "Greige", hex: "#C6BFB4" },
      { name: "Mushroom", hex: "#AB9F92" }, { name: "Pewter", hex: "#8E959C" },
      { name: "Greyed Navy", hex: "#42506B" }, { name: "Charcoal", hex: "#54565B" },
      { name: "Cocoa", hex: "#7E655C" }, { name: "Stone Grey", hex: "#B0ADA4" },
    ],
    accents: [
      { name: "Dusty Rose", hex: "#C08E96" }, { name: "Antique Pink", hex: "#CFA3A9" },
      { name: "Sage", hex: "#9AAE9A" }, { name: "Eucalyptus", hex: "#7FA08C" },
      { name: "Dusty Blue", hex: "#7E99B4" }, { name: "Smoky Teal", hex: "#5C8784" },
      { name: "Mauve", hex: "#A587A0" }, { name: "Heathered Plum", hex: "#8A6A85" },
      { name: "Muted Lavender", hex: "#9C92B8" }, { name: "Rosewood", hex: "#9E5B62" },
      { name: "Soft Denim", hex: "#5F7A9D" }, { name: "Misty Jade", hex: "#87AFA0" },
    ],
    statements: [
      { name: "Muted Raspberry", hex: "#A84A68" }, { name: "Soft Burgundy", hex: "#7E3B4D" },
      { name: "Smoky Amethyst", hex: "#7C6296" }, { name: "Deep Teal (soft)", hex: "#2F6B6A" },
      { name: "Blackberry", hex: "#523A5C" }, { name: "Damson Rose", hex: "#96566B" },
      { name: "Slate Blue", hex: "#5A6FA3" }, { name: "Deep Sage", hex: "#5F7A5F" },
    ],
    avoid: [
      { name: "Black", hex: "#000000" }, { name: "Pure White", hex: "#FFFFFF" },
      { name: "Bright Orange", hex: "#FF6A00" }, { name: "Hot Pink", hex: "#FF1E7C" },
      { name: "Electric Blue", hex: "#1F51FF" }, { name: "Bright Yellow", hex: "#FFD500" },
      { name: "Tomato Red", hex: "#E4572E" }, { name: "Kelly Green", hex: "#4CBB17" },
      { name: "Royal Blue", hex: "#2B4BC8" }, { name: "Vivid Fuchsia", hex: "#E1148C" },
    ],
  },

  "Soft Autumn": {
    description: "Muted, warm-neutral and blended — soft earthy colours with golden dust.",
    neutrals: [
      { name: "Cream", hex: "#F2EAD9" }, { name: "Oatmeal", hex: "#D9CDB8" },
      { name: "Mushroom Taupe", hex: "#A99785" }, { name: "Warm Grey", hex: "#9E968A" },
      { name: "Camel (soft)", hex: "#B59B76" }, { name: "Coffee", hex: "#6F5846" },
      { name: "Soft Navy", hex: "#44526B" }, { name: "Dark Chocolate", hex: "#4E3A2C" },
    ],
    accents: [
      { name: "Soft Peach", hex: "#EBB99D" }, { name: "Salmon (muted)", hex: "#D98E76" },
      { name: "Terracotta (soft)", hex: "#BE7458" }, { name: "Camel Rose", hex: "#C09578" },
      { name: "Sage Green", hex: "#98A886" }, { name: "Moss Green", hex: "#7C8B5F" },
      { name: "Olive (soft)", hex: "#8A8B5C" }, { name: "Soft Teal", hex: "#5E8B84" },
      { name: "Dusty Coral", hex: "#CE7B6D" }, { name: "Mahogany Rose", hex: "#9A5B54" },
      { name: "Warm Gold (soft)", hex: "#C7A75B" }, { name: "Buttermilk", hex: "#EEDFAE" },
    ],
    statements: [
      { name: "Rust (muted)", hex: "#A85338" }, { name: "Brick", hex: "#9E4A3A" },
      { name: "Deep Salmon", hex: "#C46A54" }, { name: "Forest (soft)", hex: "#4E6B51" },
      { name: "Deep Teal", hex: "#2F6161" }, { name: "Aubergine (warm)", hex: "#5E3A4C" },
      { name: "Tomato (muted)", hex: "#B84A3A" }, { name: "Bronze Gold", hex: "#A07E3B" },
    ],
    avoid: [
      { name: "Black", hex: "#000000" }, { name: "Pure White", hex: "#FFFFFF" },
      { name: "Hot Pink", hex: "#FF1E7C" }, { name: "Fuchsia", hex: "#D6249F" },
      { name: "Royal Blue", hex: "#2B4BC8" }, { name: "Electric Turquoise", hex: "#00D1CB" },
      { name: "Icy Grey", hex: "#C9D1D9" }, { name: "Vivid Purple", hex: "#7B2FBE" },
      { name: "Bright Lemon", hex: "#F5E200" }, { name: "True Red (cool)", hex: "#D0102F" },
    ],
  },

  "True Autumn": {
    description: "Warm and rich — golden, spiced, earthy colours at full depth.",
    neutrals: [
      { name: "Cream", hex: "#F3E9D2" }, { name: "Camel", hex: "#B08E5A" },
      { name: "Tan", hex: "#C19A6B" }, { name: "Warm Khaki", hex: "#9E8B57" },
      { name: "Chocolate Brown", hex: "#5D4126" }, { name: "Coffee Bean", hex: "#4B3320" },
      { name: "Olive Brown", hex: "#6E6337" }, { name: "Warm Stone", hex: "#CBB894" },
    ],
    accents: [
      { name: "Terracotta", hex: "#C1633F" }, { name: "Pumpkin", hex: "#D3722C" },
      { name: "Mustard", hex: "#D2A106" }, { name: "Golden Yellow", hex: "#E3B505" },
      { name: "Olive Green", hex: "#708238" }, { name: "Moss", hex: "#7A8B3A" },
      { name: "Teal (warm)", hex: "#3A7D74" }, { name: "Petrol", hex: "#2F6A78" },
      { name: "Salmon", hex: "#DB7B5B" }, { name: "Paprika", hex: "#B54B31" },
      { name: "Bronze", hex: "#9C7A3C" }, { name: "Warm Coral", hex: "#D96B4F" },
    ],
    statements: [
      { name: "Rust", hex: "#B7410E" }, { name: "Burnt Orange", hex: "#C1531B" },
      { name: "Tomato Red", hex: "#C93A26" }, { name: "Forest Green", hex: "#3F5B33" },
      { name: "Deep Teal", hex: "#20605E" }, { name: "Saffron", hex: "#E09900" },
      { name: "Mahogany", hex: "#7B3325" }, { name: "Deep Olive", hex: "#535A20" },
    ],
    avoid: [
      { name: "Black", hex: "#000000" }, { name: "Pure White", hex: "#FFFFFF" },
      { name: "Icy Blue", hex: "#BFD7EA" }, { name: "Fuchsia", hex: "#D6249F" },
      { name: "Cool Pink", hex: "#EF8DB6" }, { name: "Royal Blue", hex: "#2B4BC8" },
      { name: "Lavender", hex: "#B6A6D4" }, { name: "Silver Grey", hex: "#BEC6CC" },
      { name: "Bubblegum", hex: "#F783B0" }, { name: "Cool Burgundy", hex: "#701C3E" },
    ],
  },

  "Deep Autumn": {
    description: "Warm-neutral and deep — the richest, darkest of the warm palettes.",
    neutrals: [
      { name: "Cream", hex: "#F1E7CF" }, { name: "Camel", hex: "#A9854D" },
      { name: "Dark Chocolate", hex: "#3E2B1C" }, { name: "Espresso", hex: "#33261A" },
      { name: "Deep Olive", hex: "#4E4A22" }, { name: "Warm Charcoal", hex: "#3E3A36" },
      { name: "Dark Navy (warm)", hex: "#26334D" }, { name: "Bronze Taupe", hex: "#8A744F" },
    ],
    accents: [
      { name: "Terracotta", hex: "#B65A38" }, { name: "Copper", hex: "#B4652E" },
      { name: "Mustard", hex: "#C89B12" }, { name: "Olive", hex: "#66702E" },
      { name: "Forest", hex: "#38553A" }, { name: "Teal", hex: "#1F5F63" },
      { name: "Warm Burgundy", hex: "#6E2C25" }, { name: "Salmon (deep)", hex: "#C96A4A" },
      { name: "Antique Gold", hex: "#A98A2F" }, { name: "Paprika", hex: "#A64229" },
      { name: "Deep Petrol", hex: "#1E4E5F" }, { name: "Tobacco", hex: "#7A5230" },
    ],
    statements: [
      { name: "Deep Rust", hex: "#96371C" }, { name: "Oxblood (warm)", hex: "#5E2419" },
      { name: "Aubergine (warm)", hex: "#502B3A" }, { name: "Dark Emerald (warm)", hex: "#1F5741" },
      { name: "Tomato Red (deep)", hex: "#B02E1C" }, { name: "Burnt Sienna", hex: "#8A3B12" },
      { name: "Deep Teal", hex: "#124A4C" }, { name: "Golden Bronze", hex: "#8F6C1E" },
    ],
    avoid: [
      { name: "Pastel Pink", hex: "#F5C6D6" }, { name: "Icy Blue", hex: "#BFD7EA" },
      { name: "Powder Lavender", hex: "#CBBFE3" }, { name: "Cool Silver", hex: "#C4CBD1" },
      { name: "Bubblegum Pink", hex: "#F783B0" }, { name: "Mint", hex: "#B4E3C8" },
      { name: "Fuchsia", hex: "#D6249F" }, { name: "Icy Lemon", hex: "#F7F3B0" },
      { name: "Cool Rose", hex: "#DD8CA7" }, { name: "Dusty Pastel Blue", hex: "#B7CBDD" },
    ],
  },

  "Deep Winter": {
    description: "Cool-neutral and deep — dramatic dark colours with icy clarity.",
    neutrals: [
      { name: "Black", hex: "#000000" }, { name: "Charcoal", hex: "#2F3237" },
      { name: "Dark Navy", hex: "#1B2A4A" }, { name: "Pure White", hex: "#FFFFFF" },
      { name: "Cool Taupe (dark)", hex: "#6E6660" }, { name: "Pewter", hex: "#7E858D" },
      { name: "Espresso (cool)", hex: "#3B2F2F" }, { name: "Ink", hex: "#20242E" },
    ],
    accents: [
      { name: "Deep Emerald", hex: "#0E5A3E" }, { name: "Pine", hex: "#1F4A44" },
      { name: "True Red", hex: "#C8102E" }, { name: "Cherry", hex: "#A6032F" },
      { name: "Sapphire", hex: "#1E4396" }, { name: "Deep Teal", hex: "#0F4C5C" },
      { name: "Amethyst (deep)", hex: "#5B3E96" }, { name: "Magenta (deep)", hex: "#A61E67" },
      { name: "Icy Pink", hex: "#EBD4E1" }, { name: "Icy Blue", hex: "#D4E4F2" },
      { name: "Cool Ruby", hex: "#8E1B3F" }, { name: "Deep Fuchsia", hex: "#B01E77" },
    ],
    statements: [
      { name: "Burgundy (cool)", hex: "#5C1A33" }, { name: "Blackberry", hex: "#3E2452" },
      { name: "Royal Blue", hex: "#2B4BC8" }, { name: "Bottle Green", hex: "#0B4034" },
      { name: "Deep Plum", hex: "#4E2A5A" }, { name: "Crimson", hex: "#AF0F32" },
      { name: "Midnight Purple", hex: "#33204D" }, { name: "Dark Cerise", hex: "#983057" },
    ],
    avoid: [
      { name: "Camel", hex: "#B9905F" }, { name: "Mustard", hex: "#D2A106" },
      { name: "Rust", hex: "#B7410E" }, { name: "Warm Olive", hex: "#7A7A2F" },
      { name: "Peach", hex: "#FFCBA4" }, { name: "Salmon", hex: "#FA8A6B" },
      { name: "Golden Brown", hex: "#8B5F2F" }, { name: "Cream Gold", hex: "#EBD8A4" },
      { name: "Muted Sage", hex: "#9AA88A" }, { name: "Dusty Rose", hex: "#B58B8B" },
    ],
  },

  "True Winter": {
    description: "Cool and clear — high-contrast jewel tones, pure white and black.",
    neutrals: [
      { name: "Black", hex: "#000000" }, { name: "Pure White", hex: "#FFFFFF" },
      { name: "Charcoal", hex: "#33373D" }, { name: "Navy", hex: "#1F3358" },
      { name: "Cool Grey", hex: "#9AA1A9" }, { name: "Silver Grey", hex: "#C3CAD1" },
      { name: "Ink Blue", hex: "#1A2440" }, { name: "Slate (cool)", hex: "#4E5A68" },
    ],
    accents: [
      { name: "Emerald", hex: "#009B77" }, { name: "True Red", hex: "#D0102F" },
      { name: "Fuchsia", hex: "#D6249F" }, { name: "Royal Blue", hex: "#2B4BC8" },
      { name: "Cobalt", hex: "#1F4FD8" }, { name: "Magenta", hex: "#C2185B" },
      { name: "Violet", hex: "#6A35B8" }, { name: "Ice Pink", hex: "#F0D9E7" },
      { name: "Ice Blue", hex: "#DCE9F5" }, { name: "Ice Lavender", hex: "#E4DEF2" },
      { name: "Raspberry (clear)", hex: "#C21E56" }, { name: "Deep Sapphire", hex: "#123B8F" },
    ],
    statements: [
      { name: "Crimson", hex: "#B80F2E" }, { name: "Hot Pink (cool)", hex: "#E9198C" },
      { name: "Electric Blue", hex: "#1F51FF" }, { name: "Deep Emerald", hex: "#0B6B4F" },
      { name: "Royal Purple", hex: "#5A2D9E" }, { name: "Cerise", hex: "#D81B60" },
      { name: "Deep Plum", hex: "#4B2263" }, { name: "Bottle Green", hex: "#0B4034" },
    ],
    avoid: [
      { name: "Camel", hex: "#B9905F" }, { name: "Rust", hex: "#B7410E" },
      { name: "Mustard", hex: "#D2A106" }, { name: "Peach", hex: "#FFCBA4" },
      { name: "Golden Yellow", hex: "#FFC93C" }, { name: "Olive", hex: "#6B8E23" },
      { name: "Warm Beige", hex: "#DCC7A1" }, { name: "Terracotta", hex: "#C1633F" },
      { name: "Muted Mauve", hex: "#B784A7" }, { name: "Oatmeal", hex: "#D6CBB4" },
    ],
  },

  "Bright Winter": {
    description: "Cool-leaning and ultra-vivid — electric brights against stark neutrals.",
    neutrals: [
      { name: "Black", hex: "#000000" }, { name: "Pure White", hex: "#FFFFFF" },
      { name: "Charcoal", hex: "#33373D" }, { name: "Bright Navy", hex: "#1E3C8C" },
      { name: "Cool Grey (light)", hex: "#C3CAD1" }, { name: "Ink", hex: "#20242E" },
      { name: "Dark Taupe (cool)", hex: "#6E6660" }, { name: "Icy Grey", hex: "#DDE3E8" },
    ],
    accents: [
      { name: "Fuchsia", hex: "#E1148C" }, { name: "Hot Pink", hex: "#FF2E88" },
      { name: "Cobalt", hex: "#2450E0" }, { name: "Electric Turquoise", hex: "#00CFD1" },
      { name: "Emerald (bright)", hex: "#00A876" }, { name: "Violet (bright)", hex: "#7A3BD8" },
      { name: "True Red", hex: "#D0102F" }, { name: "Cerise", hex: "#DB1D6E" },
      { name: "Ice Pink", hex: "#F3DCE9" }, { name: "Ice Blue", hex: "#DEEDF8" },
      { name: "Lemon Ice", hex: "#F3F0C2" }, { name: "Bright Sapphire", hex: "#1B48C8" },
    ],
    statements: [
      { name: "Electric Blue", hex: "#1F51FF" }, { name: "Shocking Pink", hex: "#F5148C" },
      { name: "Vivid Emerald", hex: "#00B27A" }, { name: "Bright Crimson", hex: "#D40C36" },
      { name: "Vivid Purple", hex: "#7B2FBE" }, { name: "Bright Cyan", hex: "#00C3E3" },
      { name: "Neon Raspberry", hex: "#E9256E" }, { name: "Ultramarine", hex: "#2338C9" },
    ],
    avoid: [
      { name: "Oatmeal", hex: "#D6CBB4" }, { name: "Dusty Rose", hex: "#B58B8B" },
      { name: "Muted Sage", hex: "#9AA88A" }, { name: "Camel", hex: "#B9905F" },
      { name: "Rust", hex: "#B7410E" }, { name: "Mustard", hex: "#D2A106" },
      { name: "Terracotta", hex: "#C1633F" }, { name: "Warm Brown", hex: "#8B5F2F" },
      { name: "Soft Mauve", hex: "#B98CA6" }, { name: "Olive Drab", hex: "#6B6B47" },
    ],
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { imageUrl, imagePath } = await req.json();
    if (!imageUrl) throw new Error("imageUrl is required");

    console.log("Analysing image for user:", user.id);

    const systemPrompt = `You are a professional colour analyst performing a 12-season personal colour analysis from a photograph.

STEP 0 — PHOTO QUALITY GATE. Assess the photo, then choose one of three paths:
1. ANALYSE NORMALLY: bare-faced, even natural light, face clear.
2. ANALYSE WITH REDUCED CONFIDENCE: bare-faced but imperfect — mild reflections or haze, slightly uneven or indoor-but-reasonable lighting, slight softness. Cap confidence at 'medium' (use 'low' if also poorly lit) and name the specific limitation in the evidence fields.
3. RETAKE (hard cases only): face substantially obscured, heavy filters, very dark or very blurry, or severe colour cast that clearly falsifies skin tone.
Makeup is NEVER a rejection by itself. If makeup appears present at any level (subtle or obvious), do not retake for it: note what was observed (e.g. "appears to be wearing foundation and lipstick"), cap confidence at 'medium', and include in the evidence fields a note that the results assume the observed colouring is natural. Never reject for natural features of the face itself (under-eye shading, deep-set eyes, natural dark lashes, full brows, natural lip pigmentation — these are features, not makeup).

STEP 1 — ASSESS THREE DIMENSIONS (professional methodology). Examine
skin, eyes, and hair together:
- UNDERTONE: warm / cool / neutral. Evidence: skin's golden vs pink cast, eye colour temperature, hair's ash vs golden quality.
- VALUE: light / medium / deep. Overall depth of colouring.
- CHROMA: clear / soft. Whether colouring is bright and contrasted
  or muted and blended.
State the evidence for each judgment explicitly.

CONFIDENCE RULE: If undertone is neutral or near-neutral (evidence points both ways), confidence MUST be 'medium' at most, secondary_season MUST name the sister season on the other temperature side (e.g. Soft Autumn ↔ Soft Summer), and the summary must say the person sits between the two and both palettes are worth exploring. 'High' confidence is reserved for unambiguous colouring.

STEP 2 — MAP TO ONE OF THE 12 SEASONS: Light Spring, True Spring,
Bright Spring, Light Summer, True Summer, Soft Summer, Soft Autumn,
True Autumn, Deep Autumn, Deep Winter, True Winter, Bright Winter.
Choose the single best fit. If genuinely between two, name the
primary and note the secondary.

STEP 3 — OUTPUT. Hex codes must accurately represent each named
colour — a swatch of "Fuchsia" must render as vivid pink-purple,
never pale or grey. This applies equally to avoid_colours.
Return ONLY valid JSON, no markdown, no preamble:
{
  "status": "ok" | "retake",
  "retake_reason": string or null,
  "season": string or null,
  "secondary_season": string or null,
  "confidence": "high" | "medium" | "low",
  "skin_tone": "short description, e.g. light / light to medium /
    medium / deep",
  "undertone": {"verdict": string, "evidence": string},
  "value": {"verdict": string, "evidence": string},
  "chroma": {"verdict": string, "evidence": string},
  "best_colours": [8-12 colour names with hex codes, e.g.
    {"name": "Emerald", "hex": "#009B77"}],
  "avoid_colours": [4-6 colours with hex codes],
  "summary": "2-3 sentences in British English, warm and
    professional, explaining her season and how to use it"
}
Use British English throughout. Never guess on an unusable photo - return the retake status instead.`;

    const colourItemSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        hex: { type: "string", description: "Hex colour code e.g. #009B77" },
      },
      required: ["name", "hex"],
      additionalProperties: false,
    };

    const dimensionSchema = {
      type: "object",
      properties: {
        verdict: { type: "string" },
        evidence: { type: "string" },
      },
      required: ["verdict", "evidence"],
      additionalProperties: false,
    };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Please analyse this photo and provide a complete 12-season colour analysis." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "provide_analysis",
              description: "Return the structured 12-season colour analysis results",
              parameters: {
                type: "object",
                properties: {
                  status: { type: "string", enum: ["ok", "retake"] },
                  retake_reason: { type: ["string", "null"] },
                  season: { type: ["string", "null"] },
                  secondary_season: { type: ["string", "null"] },
                  confidence: { type: "string", enum: ["high", "medium", "low"] },
                  skin_tone: { type: "string" },
                  undertone: dimensionSchema,
                  value: dimensionSchema,
                  chroma: dimensionSchema,
                  best_colours: { type: "array", items: colourItemSchema },
                  avoid_colours: { type: "array", items: colourItemSchema },
                  summary: { type: "string" },
                },
                required: [
                  "status",
                  "confidence",
                  "skin_tone",
                  "undertone",
                  "value",
                  "chroma",
                  "summary",
                ],

                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "provide_analysis" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const raw = JSON.parse(toolCall.function.arguments);

    // Retake path — do not save.
    if (raw.status === "retake") {
      return new Response(
        JSON.stringify({
          analysis: {
            status: "retake",
            retake_reason: raw.retake_reason || "Please retake your photo in even, natural light.",
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Canonical per-season palette lookup — best/avoid colours come from
    // SEASON_PALETTES, not the AI. Fall back to the AI's own colours if the
    // returned season name is not in the map.
    const seasonKey = typeof raw.season === "string" ? raw.season.trim() : "";
    const palette = SEASON_PALETTES[seasonKey];
    let bestColours: Array<{ name: string; hex: string; group?: string }>;
    let avoidColours: Array<{ name: string; hex: string }>;
    if (palette) {
      bestColours = [
        ...palette.neutrals.map((c) => ({ ...c, group: "neutral" as const })),
        ...palette.accents.map((c) => ({ ...c, group: "accent" as const })),
        ...palette.statements.map((c) => ({ ...c, group: "statement" as const })),
      ];
      avoidColours = palette.avoid.map((c) => ({ name: c.name, hex: c.hex }));
    } else {
      console.warn(
        `Season "${seasonKey}" not found in SEASON_PALETTES — falling back to AI-generated colours.`,
      );
      bestColours = sanitiseColourList(raw.best_colours);
      avoidColours = sanitiseColourList(raw.avoid_colours);
    }

    const analysis = {
      status: "ok" as const,
      retake_reason: null,
      season: raw.season || null,
      secondary_season: raw.secondary_season || null,
      confidence: raw.confidence,
      skin_tone: raw.skin_tone,
      undertone: raw.undertone,
      value: raw.value,
      chroma: raw.chroma,
      best_colours: bestColours,
      avoid_colours: avoidColours,
      summary: raw.summary,
    };


    // Save to profile
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

    const { error: updateError } = await adminSupabase
      .from("user_style_profiles")
      .update({
        color_analysis: analysis,
        analysis_image_url: imagePath || imageUrl,
        skin_tone: analysis.skin_tone,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Error saving analysis:", updateError);
    }

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("color-analysis error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
