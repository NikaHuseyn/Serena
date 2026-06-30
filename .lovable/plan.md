## Goal

Bring the community composer (and edit dialog) up to a modern social experience: emoji picker, @mentions for people, #hashtags, brand tags, and location tags. Display + filter on the feed where relevant.

## What you'll see

**In the composer + edit dialog**
- Emoji 😀 button next to the caption — opens a picker, inserts at cursor.
- Typing `@` opens an autocomplete of community members (display name, avatar). Selecting inserts `@username`.
- Typing `#` opens an autocomplete of recently used hashtags. Selecting inserts `#tag`.
- A "Tag brands" chip-input below the caption — autocomplete from a curated brand list, multi-select.
- An "Add location" button — free-text now (Google Places later if you connect it).

**On each post card**
- Caption renders `@mentions` (link to profile), `#hashtags` (link to filtered feed), brand chips, and a small location pill above the caption.
- Tapping a hashtag or brand filters the feed.
- Mentioned users get a notification.

## Build steps

1. **Database migration**
   - Add columns to `posts`: `mentioned_user_ids uuid[]`, `brand_tags text[]`, `location text`. (`tags text[]` already exists for hashtags.)
   - New table `public.brands(id, name, slug, logo_url)` with `GRANT SELECT` to anon/authenticated; seed ~80 popular fashion brands.
   - Index `posts(tags)` and `posts(brand_tags)` (GIN) for filter performance.
   - Notification insert trigger: when a post is created/updated with new `mentioned_user_ids`, insert a `mention` notification per user.

2. **Composer (`PostCreationForm` + `EditPostDialog`)**
   - Install `emoji-picker-react` (lightweight, no backend).
   - Build a reusable `RichCaptionInput` that wraps `Textarea`:
     - Tracks cursor; detects `@foo` / `#foo` tokens; shows a floating autocomplete (`Command` from shadcn).
     - `@` queries `social_profiles` by `display_name ilike`.
     - `#` queries distinct recent `tags` from `posts`.
     - On select, replaces the token and records the id (for mentions) / tag string.
   - Brand chip-input: shadcn `Command` + `Badge`, queries `brands`.
   - Location: simple text input with a pin icon (placeholder for Places later).
   - Emoji button inserts at cursor position.

3. **Hook updates (`useSocialPosts`)**
   - Extend `CreatePostData` + `updatePost` with `tags`, `mentioned_user_ids`, `brand_tags`, `location`.
   - Parse `#tags` and `@mentions` out of caption on submit (single source of truth = caption).

4. **Display (`PostCard`)**
   - New `CaptionRenderer` that tokenises caption and renders `@user` and `#tag` as `<Link>`s.
   - Location pill above caption with map-pin icon.
   - Brand chips row below caption, each linking to filtered feed.

5. **Feed filtering**
   - Route params `?tag=summer` and `?brand=zara` on `/community`.
   - `useSocialPosts` accepts optional filter; uses `.contains('tags', [tag])` / `.contains('brand_tags', [brand])`.
   - Filter chip header with a "Clear" button.

6. **Notifications**
   - Existing `notifications` table — add `'mention'` to allowed types in app code.
   - Bell badge already wired via `useCommunityNotifications`.

## Technical details

- **Mentions storage**: store `@displayname` text in caption AND `mentioned_user_ids uuid[]` separately, so renaming a user doesn't break old posts and notifications stay accurate.
- **Hashtag normalisation**: lowercase, strip punctuation, max 30 chars, dedupe.
- **Brand list source**: static seed migration (Zara, H&M, COS, Arket, Uniqlo, &Other Stories, Massimo Dutti, Mango, Reformation, Ganni, Aritzia, Madewell, Everlane, Nike, Adidas, New Balance, Nordstrom, Net-a-Porter, SSENSE, Farfetch, Vinted, Depop, etc.). Editable later.
- **Location**: free-text v1 (e.g., "London, UK"). Add Google Places autocomplete in v2 if you want — needs a Places API key.
- **Bundle impact**: `emoji-picker-react` is ~150KB gzipped; lazy-loaded only when the picker opens.
- **RLS**: `brands` is public-read; `posts` policies already cover the new columns.

## Out of scope (flag for follow-up)

- Google Places autocomplete (needs API key).
- Brand verification / brand pages.
- Mention notifications via email/push (in-app only for v1).

Shall I build it?
