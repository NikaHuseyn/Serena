import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "delete_wardrobe_item",
  title: "Delete wardrobe item",
  description: "Permanently remove one garment from the signed-in user's wardrobe by its id.",
  inputSchema: {
    id: z.string().describe("The wardrobe item id (uuid) returned by list_wardrobe_items."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("wardrobe_items")
      .delete()
      .eq("id", id)
      .eq("user_id", ctx.getUserId())
      .select("id, name");

    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    if (!data || data.length === 0) {
      return { content: [{ type: "text", text: "No wardrobe item found with that id." }], isError: true };
    }
    return {
      content: [{ type: "text", text: `Deleted "${data[0].name}".` }],
      structuredContent: { deleted: data[0] },
    };
  },
});
