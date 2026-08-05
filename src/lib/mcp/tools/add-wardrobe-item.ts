import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "add_wardrobe_item",
  title: "Add wardrobe item",
  description: "Add a garment to the signed-in user's wardrobe.",
  inputSchema: {
    name: z.string().trim().describe("Short descriptive name, e.g. 'Black slip dress'."),
    category: z
      .enum(["dress", "top", "bottom", "shoes", "outerwear", "accessory"])
      .describe("Garment category."),
    color: z.string().optional().describe("Plain colour word, e.g. navy."),
    brand: z.string().optional(),
    size: z.string().optional(),
    notes: z.string().optional().describe("Fabric or styling notes."),
    tags: z.array(z.string()).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ name, category, color, brand, size, notes, tags }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    if (!name.trim()) {
      return { content: [{ type: "text", text: "Item name is required" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("wardrobe_items")
      .insert({
        user_id: ctx.getUserId(),
        name: name.trim(),
        category,
        color: color ?? null,
        brand: brand ?? null,
        size: size ?? null,
        notes: notes ?? null,
        tags: tags ?? null,
      })
      .select("id, name, category, color, brand, size, tags, notes");

    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data?.[0] ?? null) }],
      structuredContent: { item: data?.[0] ?? null },
    };
  },
});
