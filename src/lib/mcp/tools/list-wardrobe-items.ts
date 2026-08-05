import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_wardrobe_items",
  title: "List wardrobe items",
  description:
    "List the signed-in user's wardrobe items, optionally filtered by category (dress, top, bottom, shoes, outerwear, accessory).",
  inputSchema: {
    category: z
      .string()
      .optional()
      .describe("Optional category filter, e.g. dress, top, bottom, shoes, outerwear, accessory."),
    limit: z.number().int().optional().describe("Maximum number of items to return (default 50, max 200)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ category, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const capped = Math.min(Math.max(limit ?? 50, 1), 200);
    let query = supabase
      .from("wardrobe_items")
      .select("id, name, category, color, brand, size, tags, notes, created_at")
      .eq("user_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(capped);
    if (category) query = query.eq("category", category.toLowerCase().trim());

    const { data, error } = await query;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { items: data ?? [] },
    };
  },
});
