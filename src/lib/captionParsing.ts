// Shared helpers for parsing/normalising hashtags and @mentions in post captions.

export const HASHTAG_REGEX = /#([\p{L}\p{N}_]{1,30})/gu;
export const MENTION_REGEX = /@([\p{L}\p{N}_.]{1,40})/gu;

export interface MentionMap {
  // mention text (without @, normalised lowercase) -> user_id
  [handle: string]: string;
}

export const normaliseHandle = (s: string) => s.trim().toLowerCase();

export const normaliseTag = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .slice(0, 30);

export function extractHashtags(caption: string): string[] {
  const out = new Set<string>();
  for (const m of caption.matchAll(HASHTAG_REGEX)) {
    const t = normaliseTag(m[1]);
    if (t) out.add(t);
  }
  return [...out];
}

export function extractMentionedUserIds(caption: string, mentionMap: MentionMap): string[] {
  const ids = new Set<string>();
  for (const m of caption.matchAll(MENTION_REGEX)) {
    const id = mentionMap[normaliseHandle(m[1])];
    if (id) ids.add(id);
  }
  return [...ids];
}

// Tokenise a caption into plain text / hashtag / mention segments for rendering.
export type CaptionToken =
  | { type: 'text'; value: string }
  | { type: 'hashtag'; value: string; raw: string }
  | { type: 'mention'; value: string; raw: string };

export function tokeniseCaption(caption: string): CaptionToken[] {
  if (!caption) return [];
  const tokens: CaptionToken[] = [];
  const combined = /(#[\p{L}\p{N}_]{1,30})|(@[\p{L}\p{N}_.]{1,40})/gu;
  let lastIndex = 0;
  for (const m of caption.matchAll(combined)) {
    const idx = m.index ?? 0;
    if (idx > lastIndex) tokens.push({ type: 'text', value: caption.slice(lastIndex, idx) });
    const raw = m[0];
    if (raw.startsWith('#')) {
      tokens.push({ type: 'hashtag', value: normaliseTag(raw.slice(1)), raw });
    } else {
      tokens.push({ type: 'mention', value: normaliseHandle(raw.slice(1)), raw });
    }
    lastIndex = idx + raw.length;
  }
  if (lastIndex < caption.length) tokens.push({ type: 'text', value: caption.slice(lastIndex) });
  return tokens;
}
