import { PRODUCT_SORTS, type ProductSort } from '@/lib/catalog/sorts';

/**
 * Pure helpers for translating between the URL and catalog filter state.
 *
 * Filters live in the URL rather than component state so that a filtered listing is
 * shareable, bookmarkable, survives reload, and works with the back button for free.
 * Keeping the translation pure (no router, no hooks) makes it unit-testable and keeps
 * the client components thin.
 */

export type CatalogFilters = {
  category?: string;
  sort?: ProductSort;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
  q?: string;
};

export const DEFAULT_SORT: ProductSort = 'newest';

export const SORT_LABELS: Record<ProductSort, string> = {
  relevance: 'Most relevant',
  newest: 'Newest first',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  rating: 'Customer rating',
};

/** Sorts offered in the UI. `relevance` only makes sense with a search term. */
export const BROWSE_SORTS: readonly ProductSort[] = [
  'newest',
  'price-asc',
  'price-desc',
  'rating',
];

/** Price bands offered as quick filters, in minor units. */
export const PRICE_BANDS: ReadonlyArray<{ label: string; min?: number; max?: number }> = [
  { label: 'Under ₹500', max: 50_000 },
  { label: '₹500 – ₹2,000', min: 50_000, max: 200_000 },
  { label: '₹2,000 – ₹10,000', min: 200_000, max: 1_000_000 },
  { label: '₹10,000 – ₹50,000', min: 1_000_000, max: 5_000_000 },
  { label: 'Over ₹50,000', min: 5_000_000 },
];

function positiveInt(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Read filters out of a URLSearchParams. Anything unparseable is dropped rather than
 * carried forward, so a hand-edited URL degrades to a sensible listing instead of an
 * error page.
 */
export function parseFilters(params: URLSearchParams | ReadonlyMap<string, string>): CatalogFilters {
  const get = (key: string): string | null => {
    if (params instanceof URLSearchParams) return params.get(key);
    return params.get(key) ?? null;
  };

  const sortRaw = get('sort');
  const sort = PRODUCT_SORTS.includes(sortRaw as ProductSort)
    ? (sortRaw as ProductSort)
    : undefined;

  const minRating = positiveInt(get('minRating'));
  const q = get('q')?.trim();

  return {
    sort,
    minPrice: positiveInt(get('minPrice')),
    maxPrice: positiveInt(get('maxPrice')),
    // Only 1-5 are meaningful; anything else is treated as no filter.
    minRating: minRating !== undefined && minRating >= 1 && minRating <= 5 ? minRating : undefined,
    inStock: get('inStock') === 'true' ? true : undefined,
    q: q ? q : undefined,
  };
}

/**
 * Serialise filters back to a query string.
 *
 * Defaults are omitted so the canonical URL for an unfiltered listing is clean (`/`,
 * not `/?sort=newest&inStock=false`). Keys are emitted in a fixed order so the same
 * filter state always produces the same string — which is what makes it safe to use as
 * a cache key and a React `key`.
 */
export function buildQueryString(filters: CatalogFilters): string {
  const params = new URLSearchParams();

  if (filters.q) params.set('q', filters.q);
  if (filters.category) params.set('category', filters.category);
  if (filters.sort && filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort);
  if (filters.minPrice !== undefined) params.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set('maxPrice', String(filters.maxPrice));
  if (filters.minRating !== undefined) params.set('minRating', String(filters.minRating));
  if (filters.inStock) params.set('inStock', 'true');

  return params.toString();
}

/**
 * Stable identity for a filter set. Used both as the sessionStorage key for restoring
 * an infinite-scroll position and as the React key that forces the list to reset when
 * filters change.
 */
export function filtersKey(filters: CatalogFilters): string {
  return buildQueryString({ ...filters, sort: filters.sort ?? DEFAULT_SORT }) || 'all';
}

/** Build the API URL for a page of results. */
export function productsApiUrl(
  filters: CatalogFilters,
  options: { cursor?: string | null; limit?: number } = {},
): string {
  const params = new URLSearchParams(buildQueryString(filters));
  // The API defaults to `newest`, but be explicit so the client and server agree even
  // if that default ever changes.
  if (filters.sort) params.set('sort', filters.sort);
  if (options.cursor) params.set('cursor', options.cursor);
  if (options.limit !== undefined) params.set('limit', String(options.limit));

  return `/api/products?${params.toString()}`;
}

export function hasActiveFilters(filters: CatalogFilters): boolean {
  return (
    filters.minPrice !== undefined ||
    filters.maxPrice !== undefined ||
    filters.minRating !== undefined ||
    filters.inStock === true
  );
}

export function countActiveFilters(filters: CatalogFilters): number {
  let count = 0;
  // A price band is one filter even when it sets both bounds.
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) count++;
  if (filters.minRating !== undefined) count++;
  if (filters.inStock) count++;
  return count;
}

/** Drop every filter but keep the category and search term the user is browsing within. */
export function clearedFilters(filters: CatalogFilters): CatalogFilters {
  return { category: filters.category, q: filters.q, sort: filters.sort };
}
