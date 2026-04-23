# AnimeKAI UI/UX Audit Report

---

## 🔴 Broken Functionality (Critical)

---

### 1. **`ControlBtn` Bookmark is completely non-functional**

**File:** `components/anime/WatchExperience.tsx` — line 849

**Code:**
```tsx
<ControlBtn icon={Bookmark} label="Bookmark" />
```

**What's wrong:** No `onClick` prop is passed. The `ControlBtn` component accepts an optional `onClick`, so clicking it silently does nothing. The cursor even shows as `cursor-not-allowed` (rendered for the `disabled` case) in some browsers because there's no handler but also no `disabled` flag.

**Why it happens:** The bookmark action was wired to `AddToListButton` on the detail page but a separate `ControlBtn` was added to the watch controls bar without ever connecting it to the same bookmarks API.

**Fix:** Pass `onClick` to call `saveBookmark()`/`removeBookmark()` and wire up bookmark state using `subscribeToBookmarks()`, exactly as done in `AddToListButton.tsx`. Alternatively, replace this `ControlBtn` with `AddToListButton` styled as a small control button.

---

### 2. **HomeHeroCarousel bookmark button has no `onClick`**

**File:** `components/anime/HomeHeroCarousel.tsx` — line 98–103

**Code:**
```tsx
<button className="...">
  <span className="sr-only">Bookmark</span>
  <svg .../>
</button>
```

**What's wrong:** The bookmark button on the hero carousel has no `onClick`, no `type="button"` (actually it does omit type, so in a `<form>` context it would submit), and cannot be connected to a user's list. This is a prominent CTA on the most visible section of the homepage.

**Why it happens:** The hero was built before `AddToListButton` existed; the button was never wired up.

**Fix:** Replace the raw `<button>` with `<AddToListButton>` (compact/icon variant) passing `animeId`, `title`, `poster`, `href` from `activeSlide`.

---

### 3. **`components/sections/Hero.tsx` has two dead CTA buttons**

**File:** `components/sections/Hero.tsx` — lines 34 and 38

**Code:**
```tsx
<button className="...">WATCH NOW</button>
<button className="...">ADD TO LIST</button>
```

**What's wrong:** Both buttons have no `onClick` and are not `<Link>` elements. They do nothing when clicked. The "WATCH NOW" button is especially misleading — it looks like the primary hero action but is a no-op.

**Why it happens:** This appears to be a legacy static hero component (`components/sections/Hero.tsx`) left over before the dynamic `HomeHeroCarousel.tsx` took over the homepage. It may still be rendered in some route.

**Fix:** Either remove this component entirely if it is unused, or replace with proper `<Link>` routing. Check if any page imports `components/sections/Hero.tsx` and replace it with the live `HomeHeroCarousel`.

---

### 4. **SeasonRail prev/next scroll buttons are non-functional**

**File:** `components/anime/watch/WatchUiPrimitives.tsx` — lines 78–83

**Code:**
```tsx
<button type="button" className="...">
  <ChevronLeft />
</button>
<button type="button" className="...">
  <ChevronRight />
</button>
```

**What's wrong:** Both scroll buttons in `SeasonRail` have no `onClick`. They visually imply they scroll the season cards horizontally, but clicking them does nothing.

**Why it happens:** The scroll ref/logic was never implemented. The row is `overflow-x-auto` so it scrolls by native touch/scroll, but the arrow buttons are dead.

**Fix:** Add a `ref` to the scroll container div and implement `onClick={() => ref.current.scrollBy({ left: ±200, behavior: "smooth" })}` on each button.

---

## 🟡 UX Issues

---

### 5. **Sub/Dub toggle is one-directional and misleading**

**File:** `components/anime/WatchExperience.tsx` — lines 886–917

**What's wrong:** The Sub button only fires when `session.dubbed === true` (switching from dub to sub). If you're already on sub and click Sub again, nothing happens — there's no visual "active-but-not-clickable" signal beyond the color. Same for Dub. A user may tap Sub repeatedly thinking it's broken.

**Why it happens:** The guards `if (session.dubbed)` / `if (!session.dubbed)` prevent useless re-fetches, but there's no visual feedback that the button is already the active state.

**Fix:** Add `disabled` or `aria-pressed` to the active button, or add a `cursor-default` style. The inactive button should clearly be the tappable one. The current hover styles apply to both, confusing which state is interactive.

---

### 6. **Comment timestamp click does not seek the embed player**

**File:** `components/anime/WatchExperience.tsx` — line 1128–1130

**Code:**
```tsx
onTimestampClick={() => {
  document.querySelector("iframe")?.scrollIntoView({ behavior: "smooth", block: "center" });
}}
```

**What's wrong:** Clicking a comment timestamp only scrolls to the iframe — it does not seek the video to that timestamp. The embed player controls its own time. Because it's a cross-origin iframe, `postMessage` would need to be used to seek, but there's no such message protocol implemented.

**Why it happens:** The timestamp UI and the `onTimestampClick` prop were built, but the actual seek-via-postMessage was never implemented since the embed provider's postMessage API wasn't integrated.

**UX impact:** Users see a timestamp like `1:30` clickable in orange, expect it to jump to that moment, but only get scrolled to the player. This is misleading.

**Fix (high-level):** Either remove the timestamp click-to-seek UI (or make it non-clickable visually), or document that seeking requires the embed player to support postMessage and implement it for known providers that do (e.g., AniSkip-compatible embeds).

---

### 7. **Episode query/search box shows no "no results" state**

**File:** `components/anime/WatchExperience.tsx` — lines 659–666, 1042–1050

**What's wrong:** When the episode search query returns zero matches, the grid simply shows an empty div with no message. Users may think the list is still loading.

**Fix:** Add an empty-state message: `if (filteredEpisodes.length === 0) return <p>No episodes match "{episodeQuery}"</p>` inside the grid render.

---

### 8. **`NAV_LINKS` declares `/types` and `New` with duplicate icons**

**File:** `components/ui/NavbarClient.tsx` — lines 21–24

**Code:**
```ts
{ href: "/new", label: "New", icon: Sparkles },
{ href: "/updates", label: "Schedule", icon: Calendar },
{ href: "/search", label: "Browse", icon: Search },
{ href: "/genres", label: "Genres", icon: Film },
{ href: "/types", label: "Types", icon: Film },  // ← same icon as Genres
```

**What's wrong:** "This Season" and "New" both use the `Sparkles` icon. "Genres" and "Types" both use the `Film` icon. In the mobile menu, this is visually confusing — users cannot distinguish the categories at a glance.

**Fix:** Use semantically distinct icons — e.g., `Library` for Types, `Tag` for Genres, `Flame` for This Season, `Newspaper` or `Bell` for New.

---

### 9. **Sort URL for `Popularity` link is malformed**

**File:** `app/search/page.tsx` — line 196

**Code:**
```tsx
href={`/search${genre ? `?genre=...&sort=${value}` : `?sort=${value}`}`}
```

When `value` is `""` (Popularity), this generates `/search?sort=` — a trailing `sort=` with an empty value. This extra param is harmless but causes the "Popularity" option to not match the `sortParam === value` comparison correctly because `sortParam` would be `""` while `value` is `""` — actually this works. However the generated URL is `/search?sort=` which is slightly ugly and can confuse caching.

**Fix:** Skip the `sort` param entirely when `value === ""`: `value ? `?sort=${value}` : ``"`.

---

### 10. **Comment reply sharing a single `replyContent` state across all comments**

**File:** `components/anime/CommentSection.tsx` — lines 80, 310–313

**What's wrong:** `replyContent` is a single shared state string at the parent level. If a user starts typing a reply to Comment A, then opens a reply box on Comment B (without closing A), the input field carries over the previous text. While `replyTo` tracks which comment is open, the content is shared.

**Why it happens:** The reply content state was lifted to the parent without being cleared on `replyTo` change.

**Fix:** Clear `replyContent` whenever `replyTo` is set to a new ID in the `onReply` callback: `setReplyTo(id); setReplyContent("");` — this is actually already done on line 308, so the issue only manifests if the user doesn't close first. Consider moving `replyContent` state into `CommentItem` to fully isolate it.

---

### 11. **`WatchError` error page missing a "Back to Details" link**

**File:** `app/anime/[id]/watch/error.tsx`

**What's wrong:** The error boundary only offers "Retry" and "Home". There's no "Back to anime details" link. If the stream fails, users have no path back to the detail page to try a different episode. They'd have to use the browser back button.

**Fix:** Add `<Link href={`/anime/${id}`}>Back to details</Link>`. The `id` could be extracted from `window.location.pathname` in a useEffect or passed as a prop if the error boundary is made to accept route params.

---

## 📱 Mobile Issues

---

### 12. **Watch controls bar wraps poorly on narrow screens**

**File:** `components/anime/WatchExperience.tsx` — lines 819–863

**What's wrong:** The controls bar uses `flex-wrap` but the right group (Prev, Next, Bookmark, Source link) can overflow at ~375px width (iPhone SE size). The "Source" link's text is hidden with `hidden sm:inline` but the icon still adds width. At very small widths, buttons stack awkwardly with no gap management.

**Impact:** On iPhone SE (375px), all control buttons are accessible but spacing becomes cramped and visual hierarchy breaks.

**Fix:** Consider using `justify-between` consistently and reducing gap to `gap-0.5` on very small screens, or collapsing Source into a `...` overflow menu on mobile.

---

### 13. **Episode number grid cells are 40px wide (w-10) — too small for fat fingers**

**File:** `components/anime/watch/WatchUiPrimitives.tsx` — line 196

**Code:**
```tsx
className={`relative w-10 h-9 rounded-md ...`}
```

`40×36px` is below Apple's minimum recommended touch target of 44×44px. On a 500-episode anime, all episodes are rendered as small cells. Accidental taps on adjacent episodes are common.

**Fix:** Increase to `w-11 h-10` (44×40px) at minimum, or add invisible padding around each button for touch targets: `p-1 -m-1`.

---

### 14. **Season rail scroll arrows invisible on mobile (only hover state)**

**File:** `components/anime/watch/WatchUiPrimitives.tsx` — lines 78–83

**What's wrong:** The scroll arrows on `SeasonRail` use `text-white/60 hover:text-white` — on touch devices there's no hover, so they appear at 60% opacity permanently. Combined with the fact that they don't work (issue #4), they are doubly broken on mobile.

**Fix:** Increase base opacity to `text-white/80` for mobile, and implement the scroll logic.

---

### 15. **Mobile menu includes `/types` but the desktop nav does not**

**File:** `components/ui/NavbarClient.tsx` — lines 25 and NAV_LINKS

**What's wrong:** `NAV_LINKS` includes `{ href: "/types", label: "Types" }` and the mobile menu renders all of them. However the desktop nav is hardcoded to only show Trending, This Season, Browse, Genres, Schedule — `Types` and `New` are desktop-absent but mobile-present. Users get inconsistent navigation across breakpoints.

**Fix:** Either expose Types and New on desktop (perhaps behind a "More" dropdown), or remove them from `NAV_LINKS` and add them separately to the mobile-only section.

---

## ⚠️ Incomplete Features

---

### 16. **Comment timestamp recording is never triggered**

**File:** `components/anime/CommentSection.tsx` — the `timestamp` field on `CommentData`

**What's wrong:** Comments have a `timestamp: number | null` field and the UI renders timestamp buttons (lines 384–393). However there's no UI in the compose form to *set* a timestamp. The field is always `null` when posting new comments (not included in the POST body). The timestamp UI is thus purely decorative — it can never be populated by end users.

**Fix:** Add a "📍 Add timestamp" button in the compose form that captures the current playback position from the embed iframe via `postMessage` and includes it in the POST body.

---

### 17. **`/types` page exists but Types is not in the desktop navbar**

**File:** `app/types/page.tsx` exists; `components/ui/NavbarClient.tsx` desktop nav — lines 93–97

**What's wrong:** There's a fully built `/types` page and it's linked from the mobile menu and the footer, but it doesn't appear in the desktop nav bar. Users on desktop have no discoverability path to this page unless they use the footer.

**Fix:** Add a `Types` link to the desktop nav links row, or consolidate it under a "Browse" dropdown.

---

### 18. **`SearchControls.tsx` component appears unused in production search flow**

**File:** `components/anime/SearchControls.tsx`

**What's wrong:** This component (with Material-Design-style CSS tokens like `bg-surface-container`, `text-on-surface-variant`) is a different design system from the rest of the app. The actual `/search` page (`app/search/page.tsx`) does not import or render `SearchControls` — it uses its own inline filter sidebar. `SearchControls` appears to be dead code from an earlier iteration.

**Fix:** Either delete the component, or if intentionally kept for a different route (e.g., an older browse page), ensure it's consumed somewhere or marked as deprecated.

---

## Summary Table

| # | Category | Severity | File |
|---|---|---|---|
| 1 | ControlBtn Bookmark no-op | 🔴 Broken | `WatchExperience.tsx:849` |
| 2 | Hero carousel bookmark no-op | 🔴 Broken | `HomeHeroCarousel.tsx:98` |
| 3 | Static hero CTAs dead buttons | 🔴 Broken | `sections/Hero.tsx:34,38` |
| 4 | SeasonRail scroll arrows no-op | 🔴 Broken | `WatchUiPrimitives.tsx:78` |
| 5 | Sub/Dub toggle misleading UX | 🟡 UX | `WatchExperience.tsx:886` |
| 6 | Timestamp click doesn't seek | 🟡 UX | `WatchExperience.tsx:1128` |
| 7 | Episode filter empty state missing | 🟡 UX | `WatchExperience.tsx:1042` |
| 8 | Duplicate nav icons in mobile | 🟡 UX | `NavbarClient.tsx:21` |
| 9 | Sort URL has trailing `?sort=` | 🟡 UX | `search/page.tsx:196` |
| 10 | Reply content bleeds between comments | 🟡 UX | `CommentSection.tsx:80` |
| 11 | Error page missing back-to-details | 🟡 UX | `watch/error.tsx` |
| 12 | Watch controls wrap on small screens | 📱 Mobile | `WatchExperience.tsx:819` |
| 13 | Episode buttons too small for touch | 📱 Mobile | `WatchUiPrimitives.tsx:196` |
| 14 | Season arrows invisible on touch | 📱 Mobile | `WatchUiPrimitives.tsx:78` |
| 15 | Types/New absent from desktop nav | 📱 Mobile | `NavbarClient.tsx` |
| 16 | Comment timestamp never populated | ⚠️ Incomplete | `CommentSection.tsx` |
| 17 | Types page not in desktop navbar | ⚠️ Incomplete | `NavbarClient.tsx` |
| 18 | `SearchControls.tsx` appears dead | ⚠️ Incomplete | `SearchControls.tsx` |
