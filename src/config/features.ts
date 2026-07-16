// Feature flags. Flip these to re-enable disabled surfaces cleanly.
// SERENA_CHAT_ENABLED: when false, the Serena tab stays clickable but the
// chat page renders a non-functional preview with a "coming soon" overlay.
// The wardrobe "Style this" entry point (anchorItemId in router state) still
// opens the live chat. When true, the full chat is restored.
export const SERENA_CHAT_ENABLED = false;
