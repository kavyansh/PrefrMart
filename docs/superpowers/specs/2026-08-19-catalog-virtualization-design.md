# Bounding the cost of a long catalog scroll

Status: proposed
Date: 2026-08-19

## Goal

Keep the product listing cheap to render and bounded in memory no matter how far a user
scrolls, so the same code holds up against a 10k-product catalog.

## What is already solved, and what is not

Catalog **size** is not the problem. Cursor pagination is O(1) per page against any table
size — `WHERE (sortField, id) < (:last, :lastId) LIMIT 25` walks 25 rows whether the table
holds 500 or 10 million. Nothing in the data layer needs to change.

The unbounded quantity is **accumulated DOM within one scrolling session**, and its ceiling
is scroll depth × page size, not catalog size. Measured on this app:

| Cards in DOM | Elements (8/card) | Load-more actions at 24/page |
|---|---|---|
| 500 | 4,000 | 21 |
| 1,000 | 8,000 | 42 |
| 10,000 | 80,000 | 417 |

Nobody reaches 417 sequential loads, but 500–1,000 cards is realistic for a determined
shopper, and 8,000 elements is where low-end mobile starts to suffer.

Two separate costs follow from that, and they need different fixes:

- **Style, layout and paint** grow with mounted cards → Stage 1 (containment).
- **Node count and decoded image memory** grow with mounted cards → Stage 2 (page window).

The stages are independent. Stage 1 is three lines and carries no risk; Stage 2 is a real
change to `useCursorPagination` and carries the costs listed under Risks.

## Stage 1 — CSS containment

A utility in `globals.css`'s existing `@layer utilities`, applied to the `<article>` in
`ProductCard`:

```css
content-visibility: auto;
contain-intrinsic-size: auto 320px;
```

The browser skips style, layout and paint for cards outside the viewport while leaving them
in the DOM — so Ctrl+F, screen-reader browsing and scroll height all keep working.

`auto` in `contain-intrinsic-size` is what makes this safe: the browser substitutes each
card's real measured height once it has rendered, so 320px is only a first guess for cards
never yet seen. Without `auto`, a wrong estimate makes the scrollbar drift while scrolling.

**Not applied to `priority` cards** (the first four). `content-visibility: auto` never skips
on-screen content so it would be harmless, but it has documented interactions with LCP
element detection and the LCP candidate is one of those four. One conditional removes the
question.

It goes in a named utility rather than inline arbitrary values because the two properties are
meaningless apart and need the explanation above attached to them.

## Stage 2 — sliding page window

### State becomes page-shaped

`snapshot.items` is a flat array today, which has no boundaries to drop. It becomes:

```ts
type LoadedPage<T> = {
  /** The cursor that produced this page — null for the server-rendered first page. */
  cursor: string | null;
  items: T[];
  nextCursor: string | null;
  /** True once the page has been dropped and is represented by a spacer. */
  dropped?: boolean;
};
```

Each page carrying the cursor that produced it is what makes a dropped page re-fetchable
exactly, and it removes an existing bug — see below.

### Spacer height is computed, not remembered

The obvious implementation measures each page's rendered height before dropping it and stores
that number. It is also fragile: a page measured at 390px viewport width is the wrong height
at 1440px, so every stored height is invalidated by a resize or by restoring a session on a
different device.

Instead the height is derived from two live measurements:

```
columns    = getComputedStyle(grid).gridTemplateColumns.split(' ').length
cardHeight = one mounted card's offsetHeight
rows       = Math.ceil(page.items.length / columns)
height     = rows * cardHeight + (rows - 1) * gap
```

Both inputs are re-read on resize, so spacers stay correct across breakpoints without storing
anything viewport-dependent. Cards in this grid are uniform height (`aspect-square` image plus
a fixed content block), which is what makes the arithmetic valid.

### Spacers must be grid items, not wrappers

The grid is `grid-cols-2 … xl:grid-cols-5` and relies on cards being **direct children**.
Wrapping each page in a div would make each page occupy one cell.

So the hook returns a flat node list and dropped pages contribute a single full-width grid
item:

```ts
type ListNode<T> =
  | { kind: 'item'; item: T }
  | { kind: 'spacer'; key: string; height: number };
```

The spacer spans `grid-column: 1 / -1` at the computed height, so total document height is
unchanged and scroll position holds when a page is dropped.

`items` (flat, mounted only) is still returned for the two consumers that do not window, so
`ReviewList` and `OrderHistoryList` need no changes at all.

### Window size and re-entry

`maxMountedPages` defaults to **unlimited** — omitting it preserves today's behaviour exactly.
`ProductList` opts in with **5** pages: 120 cards, roughly 960 elements, and five pages of
scroll-back before a re-fetch is needed.

Only the topmost page is ever dropped, because accumulation is downward only. A second
`IntersectionObserver` watches spacers; scrolling into one re-fetches that page by its stored
cursor and re-mounts it in place.

### It fixes an existing bug

`writeSnapshot` currently stores `items.slice(0, 200)` alongside the **unclipped**
`nextCursor`. Load 300 products, navigate away and return: you get items 1–200 plus a cursor
pointing past item 300, and items 201–300 vanish silently.

Once a cursor travels with its page, items and cursors cannot disagree. Persisting the last K
pages is inherently consistent, so the bug disappears rather than being separately patched.

## Testing

Extending `src/hooks/useCursorPagination.test.ts` (jsdom is already configured):

- the existing hydration guard still holds over page-shaped state
- with `maxMountedPages` omitted, no page is ever dropped
- pages beyond the window are dropped, and a spacer of the computed height replaces them
- `scrollHeight` is unchanged across a drop
- scrolling into a spacer re-fetches that exact cursor and re-mounts the page
- a persisted snapshot round-trips items and cursors consistently (the bug above)

## Risks

1. **Ctrl+F and screen-reader browsing cannot reach dropped cards.** Unavoidable for any
   windowing, and the reason `maxMountedPages` is 5 rather than 2. Stage 1 alone does not
   have this cost, which is why the stages are separable.
2. **Scrolling up now costs a request** where it was previously free.
3. **Uniform card height is assumed** by the spacer arithmetic. True today; a card variant
   with a different height would need per-page measurement instead.
4. **Re-fetched pages can differ** from what was originally shown if the underlying data moved
   — the same window-shift hazard the existing de-duplication guards against.

## Out of scope

- Item-level windowing (`@tanstack/react-virtual`). Rejected: it must own the scroll
  container, which conflicts with the `scrollY` restore, and it cannot server-render page one
  without knowing the viewport.
- Virtualizing reviews or order history. Both are short and neither passes `storageKey`.
- Raising `DEFAULT_PAGE_SIZE`. 24 is chosen for LCP and is not this change's business.
