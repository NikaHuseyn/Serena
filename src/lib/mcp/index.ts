import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listWardrobeItemsTool from "./tools/list-wardrobe-items";
import addWardrobeItemTool from "./tools/add-wardrobe-item";
import deleteWardrobeItemTool from "./tools/delete-wardrobe-item";
import getStyleProfileTool from "./tools/get-style-profile";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "serena-outfitoracle",
  title: "serena-outfitoracle",
  version: "0.1.0",
  instructions:
    "Tools for Serena, a personal styling app. Read and manage the signed-in user's wardrobe with list_wardrobe_items, add_wardrobe_item and delete_wardrobe_item, and read their sizes, budget and colour preferences with get_style_profile. All data is scoped to the authenticated user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listWardrobeItemsTool, addWardrobeItemTool, deleteWardrobeItemTool, getStyleProfileTool],
});
