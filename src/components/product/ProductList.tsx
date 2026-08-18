'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { ProductCard } from '@/components/product/ProductCard';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import { useCursorPagination } from '@/hooks/useCursorPagination';
import type { ProductListItem } from '@/lib/catalog/products';
import type { Page } from '@/lib/pagination';
import { filtersKey, productsApiUrl, type CatalogFilters } from '@/lib/catalog/query';

/**
 * The catalog grid with infinite scroll.
 *
 * This is the one client component on the listing page; the cards it renders are server
 * components in the initial payload and plain markup thereafter.
 *
 * Accessibility: automatic loading is an *enhancement* on top of a real "Load more"
 * button. The button is always rendered and always works, because an IntersectionObserver
 * is unreachable for someone navigating by keyboard or screen reader — they never
 * "scroll" the sentinel into view. A live region announces each batch so the arrival of
 * new items is not silent.
 */
export function ProductList({
  initialPage,
  filters,
  totalCount,
}: {
  initialPage: Page<ProductListItem>;
  filters: CatalogFilters;
  /** Total matching the filters, for the "showing N of M" line. */
  totalCount: number;
}) {
  const fetchPage = useCallback(
    async (cursor: string, signal: AbortSignal): Promise<Page<ProductListItem>> => {
      const response = await fetch(productsApiUrl(filters, { cursor }), {
        signal,
        headers: { accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Products request failed with ${response.status}`);
      }

      return (await response.json()) as Page<ProductListItem>;
    },
    [filters],
  );

  const { items, isLoading, error, hasMore, loadMore, sentinelRef, loadedCount } =
    useCursorPagination<ProductListItem>({
      initialPage,
      fetchPage,
      // Scoped to the filter set: changing filters must not restore the previous
      // result set, but returning to the same filters should.
      storageKey: `plp:${filtersKey(filters)}`,
    });

  if (items.length === 0) {
    return <EmptyState />;
  }

  return (
    <div>
      <p className="mb-3 text-sm text-fg-muted" role="status">
        Showing {loadedCount.toLocaleString('en-IN')} of {totalCount.toLocaleString('en-IN')}{' '}
        {totalCount === 1 ? 'product' : 'products'}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            // Only the first row can be the LCP candidate; the rest lazy-load.
            priority={index < 4}
          />
        ))}

        {/* Skeletons occupy the incoming row so the grid does not jump when it fills. */}
        {isLoading &&
          Array.from({ length: 4 }, (_, index) => <ProductCardSkeleton key={`pending-${index}`} />)}
      </div>

      {/*
        Announces arrivals to screen readers without moving focus, which would yank the
        user out of wherever they were reading.
      */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {isLoading ? 'Loading more products' : `${loadedCount} of ${totalCount} products loaded`}
      </p>

      {/* Zero-height sentinel: crossing it pre-fetches the next page. */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />

      <div className="mt-6 flex flex-col items-center gap-3 pb-8">
        {error !== null && (
          <div className="w-full max-w-sm rounded-md border border-danger/30 bg-danger-soft p-3 text-center">
            <p className="mb-2 text-sm text-danger">{error}</p>
            <Button variant="secondary" size="sm" onClick={loadMore}>
              Try again
            </Button>
          </div>
        )}

        {hasMore && error === null && (
          <Button variant="secondary" onClick={loadMore} disabled={isLoading}>
            {isLoading ? 'Loading…' : 'Load more products'}
          </Button>
        )}

        {!hasMore && (
          <p className="text-sm text-fg-subtle">
            That&rsquo;s everything — {totalCount.toLocaleString('en-IN')}{' '}
            {totalCount === 1 ? 'product' : 'products'}.
          </p>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-12 text-center">
      <p className="mb-1 text-base font-medium">No products match these filters</p>
      <p className="text-sm text-fg-muted">
        Try widening the price range or clearing a filter.
      </p>
    </div>
  );
}
