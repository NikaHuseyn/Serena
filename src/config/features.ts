// Feature flags. Flip these to re-enable disabled surfaces cleanly.
// SERENA_CHAT_ENABLED: when false, the Serena chat tab is greyed out in the
// bottom nav, direct visits to /app or / show a "coming soon" placeholder,
// and the default landing tab becomes Community. The wardrobe "Style this"
// entry point (anchorItemId in router state) still opens the live chat.
export const SERENA_CHAT_ENABLED = false;
