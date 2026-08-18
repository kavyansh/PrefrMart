'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useTransition } from 'react';
import {
  buildQueryString,
  clearedFilters,
  countActiveFilters,
  PRICE_BANDS,
  type CatalogFilters,
} from '@/lib/catalog/query';
import type { ProductSort } from '@/lib/catalog/sorts';

/**
 * Filter state lives in the URL, so "changing a filter" is a navigation.
 *
 * That choice buys a lot: the listing is shareable and bookmarkable, reload keeps the
 * filters, the back button undoes them, and the server always renders page one for the
 * current predicate — there is no client filter state that can drift out of sync with
 * the results on screen.
 *
 * `useTransition` is what keeps it from feeling like a page load: the current results
 * stay on screen (dimmed via `isPending`) while the next ones stream in.
 */
export function useCatalogFilters({
  filters,
  basePath,
}: {
  filters: CatalogFilters;
  /** Route to stay within — "/" or "/c/<slug>". */
  basePath: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigate = useCallback(
    (next: CatalogFilters) => {
      // On /c/<slug> the category is carried by the route, so it must not also become a
      // query param — that would produce /c/books?category=books.
      const { category: _category, ...queryFilters } = next;
      const query = buildQueryString(queryFilters);

      startTransition(() => {
        // scroll: false — a filter change should not throw the user back to the top.
        router.push(query ? `${basePath}?${query}` : basePath, { scroll: false });
      });
    },
    [basePath, router],
  );

  const activeBand =
    PRICE_BANDS.find(
      (band) => band.min === filters.minPrice && band.max === filters.maxPrice,
    ) ?? null;

  return {
    isPending,
    activeCount: countActiveFilters(filters),
    activeBand,

    setSort: useCallback((sort: ProductSort) => navigate({ ...filters, sort }), [filters, navigate]),

    setPriceBand: useCallback(
      (band: { min?: number; max?: number } | null) =>
        navigate({ ...filters, minPrice: band?.min, maxPrice: band?.max }),
      [filters, navigate],
    ),

    setMinRating: useCallback(
      (minRating: number | undefined) => navigate({ ...filters, minRating }),
      [filters, navigate],
    ),

    toggleInStock: useCallback(
      () => navigate({ ...filters, inStock: filters.inStock ? undefined : true }),
      [filters, navigate],
    ),

    clearAll: useCallback(() => navigate(clearedFilters(filters)), [filters, navigate]),
  };
}

export type CatalogFilterActions = ReturnType<typeof useCatalogFilters>;
