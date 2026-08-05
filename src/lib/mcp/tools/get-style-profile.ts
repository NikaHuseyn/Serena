import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_style_profile",
  title: "Get style profile",
  description:
    "Read the signed-in user's style profile: sizes, budget, preferred and disliked colours and styles, body type and colour analysis.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("user_style_profiles")
      .select(
        "display_name, body_type, face_shape, fit_preference, home_city, height_cm, budget_min, budget_max, budget_currency, preferred_colors, disliked_colors, preferred_brands, preferred_fabrics, disliked_styles, items_to_avoid, color_analysis",
      )
      .eq("user_id", ctx.getUserId())
      .maybeSingle();

    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    if (!data) {
      return { content: [{ type: "text", text: "No style profile has been set up yet." }] };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { profile: data },
    };
  },
});
