## Two changes to outfit polls

### 1. Post/Poll mode toggle in `PostCreationForm`

Add a segmented toggle at the top of the form: **Post** (default) and **Which one? 👗**.

**Post mode**: leave the entire existing UI and submit flow untouched (up to 10 photos, Main label on #1, `post_type: 'single'`, caption/brands/location/mentions).

**Poll mode**: render a completely separate section that replaces the multi-photo grid, caption, brand picker, location picker, and mentions block. It contains:
- 2 to 4 fixed option slots, starting with 2. Each slot is a single-photo picker labelled "Option 1/2/3/4" with its own hidden `<input type="file">` (single, `accept="image/*"`). Selecting a photo compresses it via `ImageProcessor.compressImage` (same as today) and shows a preview with a remove (X) button.
- "Add option" button, visible while option count < 4, appends an empty slot.
- Remove-slot button on slots 3 and 4 (never removes below 2).
- One optional single-line text input for the question, placeholder: `Ask a question or add context — e.g. 'Dinner with the girls on Friday…'`.
- Submit button label: "Post poll". Enabled only when at least 2 slots have a photo.
- On submit: upload the option photos in order (reusing `uploadFiles` pattern), then call `onCreatePost` with `post_type: 'poll'`, `image_urls` in option order, `poll_question` = trimmed text or `undefined` (skip empty), `caption: ''`, no brands/location/mentions.

State is kept per-mode; switching modes does not clear the other mode's state (but is cheap since the user is composing one post). Cleanup of object URLs on unmount/reset applies to both.

Everything else in the form (header, cancel button behaviour, error handling) is shared.

### 2. Vote-reveal changes in `PollPostCard`

In `PollPostCard`, derive:
- `isAuthor = currentUserId === post.user_id`
- `hasVoted = userVote !== null`
- `showResults = isAuthor || hasVoted`

Changes:
- **Vote-count chip** on each image: render only when `showResults`.
- **Winner text** line: render only when `showResults`.
- **Per-option results** (new, only when `showResults`): under the vote button of each option, show a thin percentage bar plus text `"{pct}% · {n} vote{s}"`. Percentage = `Math.round((count / totalVotes) * 100)` when `totalVotes > 0`, else `0% · 0 votes`. Use `bg-muted` track with `bg-primary` fill; width = `${pct}%`.
- **Poll heading**: when `post.poll_question` is empty/nullish, render no `<h4>` (and no empty space). The existing "👗 Which one?" badge in the header stays.
- **Guest behaviour**: unchanged — `userVote` is always `null` for guests, `isAuthor` is false, so `showResults` is false → counts hidden. Tapping vote still triggers the existing `requireAuth` nudge inside `castVote` (guests never mutate anything).

Real-time refetch, single-vote/change-vote logic, `PollCommentSection`, and `OracleSummary` are unchanged. `useOutfitVotes` needs no changes — `totalVotes` is already exposed; consume it in the card.

### Files touched

- `src/components/community/PostCreationForm.tsx` — add mode toggle + poll composer branch.
- `src/components/community/PollPostCard.tsx` — gate counts/winner behind `showResults`, add per-option result bar, conditional heading.

No DB, hook, edge function, or other component changes.
