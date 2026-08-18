/**
 * Sort identifiers, deliberately in their own dependency-free module.
 *
 * These used to live in `lib/validation/schemas.ts`. That file imports zod, so any client
 * component importing a sort constant dragged the whole of zod into the browser bundle —
 * measured at ~62KB gzipped for the sake of a five-string array. The bundle budget check
 * caught it.
 *
 * Keep this module free of imports. `schemas.ts` imports from here, never the reverse.
 */

export const PRODUCT_SORTS = ['relevance', 'newest', 'price-asc', 'price-desc', 'rating'] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const REVIEW_SORTS = ['newest', 'highest', 'lowest'] as const;

export type ReviewSort = (typeof REVIEW_SORTS)[number];
