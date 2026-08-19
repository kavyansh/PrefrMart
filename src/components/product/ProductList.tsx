'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ProductCard } from '@/components/product/ProductCard';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import type { ProductListItem } from '@/lib/catalog/products';
import type { Page } from '@/lib/pagination';
import { filtersKey, productsApiUrl, type CatalogFilters } from '@/lib/catalog/query';

/** One class string for the real grid and the measurement probe, so they cannot disagree. */
const GRID_CLASS = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

/** Rows rendered beyond the viewport in each direction. */
const OVERSCAN_ROWS = 3;

/** Used until a real card has been measured. Corrected on the first measurement pass. */
const ESTIMATED_ROW_HEIGHT = 320;

type GridGeometry = {
  columns: number;
  rowHeight: number;
  /** The list's offset from the top of the document, for the window virtualizer. */
  listOffset: number;
};

/**
 * The catalog grid: cached pages from TanStack Query, rows virtualized by TanStack Virtual.
 *
 * Two properties shape the whole component.
 *
 * **Page one must survive without JavaScript.** It is server-rendered, and `initialData` seeds the
 * query with it, so mounting neither refetches it nor disagrees with the server's HTML.
 *
 * **Virtualization cannot start until the grid has been measured.** Column count comes from the
 * computed `grid-template-columns` and row height from a real card, and the server has neither. So
 * the first render — server and hydration alike — is a plain grid of every loaded card. Once
 * measured, rendering switches to virtualized rows. The switch happens after hydration has
 * committed, which is what keeps it out of the hydration diff.
 *
 * Accessibility: automatic loading is an *enhancement* on top of a real "Load more" button. The
 * button is always rendered and always works, because an IntersectionObserver is unreachable for
 * someone navigating by keyboard or screen reader — they never "scroll" the sentinel into view. A
 * live region announces each batch so the arrival of new items is not silent.
 *
 * Note the cost virtualization carries: a row that is not rendered cannot be found by Ctrl+F or
 * read by a screen reader. `OVERSCAN_ROWS` keeps a margin either side, and cards that are merely
 * off screen within that margin stay cheap via CSS containment (`.offscreen-skip`).
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
  /*
   * Keyed by the filter set. Changing filters is a different query rather than a reset, so the
   * previous result set stays cached — going back to it is instant and costs no request.
   */
  const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['products', filtersKey(filters)],
    queryFn: async ({ pageParam, signal }) => {
      const response = await fetch(productsApiUrl(filters, { cursor: pageParam }), {
        signal,
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Products request failed with ${response.status}`);
      return (await response.json()) as Page<ProductListItem>;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // The server already rendered this page; without it the client would refetch on mount.
    initialData: { pages: [initialPage], pageParams: [null] },
  });

  const items = useMemo(() => data.pages.flatMap((page) => page.items), [data]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ---------------------------------------------------------------------------
  // Measurement
  // ---------------------------------------------------------------------------

  const listRef = useRef<HTMLDivElement | null>(null);
  const probeRef = useRef<HTMLDivElement | null>(null);
  const [geometry, setGeometry] = useState<GridGeometry | null>(null);

  /*
   * The probe is an empty grid with the same classes, so the column count and row gap can be read
   * whichever way the list is currently rendering. Reading them from the list itself would stop
   * working the moment it switched to absolutely positioned rows.
   */
  useEffect(() => {
    const probe = probeRef.current;
    if (probe === null) return;

    const measure = () => {
      const style = window.getComputedStyle(probe);
      const columns = style.gridTemplateColumns.split(' ').filter(Boolean).length;
      const rowGap = Number.parseFloat(style.rowGap) || 0;
      const list = listRef.current;
      const cardHeight = list?.querySelector<HTMLElement>('[data-card]')?.offsetHeight;

      if (list === null || list === undefined) return;
      if (columns < 1 || cardHeight === undefined || cardHeight < 1) return;

      const next = { columns, rowHeight: cardHeight + rowGap, listOffset: list.offsetTop };
      setGeometry((previous) =>
        previous !== null &&
        previous.columns === next.columns &&
        previous.rowHeight === next.rowHeight &&
        previous.listOffset === next.listOffset
          ? previous
          : next,
      );
    };

    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(probe);
    return () => observer.disconnect();
  }, [items.length]);

  // ---------------------------------------------------------------------------
  // Virtualization
  // ---------------------------------------------------------------------------

  const columns = geometry?.columns ?? 0;
  const isVirtualized = geometry !== null && columns > 0;
  const rowCount = isVirtualized ? Math.ceil(items.length / columns) : 0;

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => geometry?.rowHeight ?? ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN_ROWS,
    // Rows are positioned relative to the document, so the list's own offset must be subtracted.
    // Measured into state rather than read from the ref: refs must not be read during render.
    scrollMargin: geometry?.listOffset ?? 0,
  });

  // ---------------------------------------------------------------------------
  // Auto-load
  // ---------------------------------------------------------------------------

  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (sentinel === null || !hasNextPage) return;
    if (typeof IntersectionObserver === 'undefined') return;

    /*
     * rootMargin starts the fetch before the sentinel is visible, so the next rows are usually
     * already there when the user arrives — that is what makes the scroll feel continuous
     * instead of stalling at each page boundary.
     */
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: '600px 0px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, hasNextPage, loadMore]);

  if (items.length === 0) {
    return <EmptyState />;
  }

  return (
    <div>
      <p className="mb-3 text-sm text-fg-muted" role="status">
        Showing {items.length.toLocaleString('en-IN')} of {totalCount.toLocaleString('en-IN')}{' '}
        {totalCount === 1 ? 'product' : 'products'}
      </p>

      {/* Zero-height probe: the only reliable source of the current column count. */}
      <div ref={probeRef} aria-hidden="true" className={`${GRID_CLASS} h-0 overflow-hidden`} />

      {isVirtualized ? (
        <div
          ref={listRef}
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
        >
          {virtualizer.getVirtualItems().map((row) => {
            const start = row.index * columns;
            return (
              <div
                key={row.key}
                data-index={row.index}
                className={GRID_CLASS}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${row.start - (geometry?.listOffset ?? 0)}px)`,
                }}
              >
                {items.slice(start, start + columns).map((product, column) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    // Only the first row can be the LCP candidate; the rest lazy-load.
                    priority={row.index === 0 && column < 4}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div ref={listRef} className={GRID_CLASS}>
          {items.map((product, index) => (
            <ProductCard key={product.id} product={product} priority={index < 4} />
          ))}
        </div>
      )}

      {/* Skeletons occupy the incoming row so the grid does not jump when it fills. */}
      {isFetchingNextPage && (
        <div className={`${GRID_CLASS} mt-3`}>
          {Array.from({ length: 4 }, (_, index) => (
            <ProductCardSkeleton key={`pending-${index}`} />
          ))}
        </div>
      )}

      {/*
        Announces arrivals to screen readers without moving focus, which would yank the
        user out of wherever they were reading.
      */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {isFetchingNextPage
          ? 'Loading more products'
          : `${items.length} of ${totalCount} products loaded`}
      </p>

      {/* Zero-height sentinel: crossing it pre-fetches the next page. */}
      <div ref={setSentinel} aria-hidden="true" className="h-px" />

      <div className="mt-6 flex flex-col items-center gap-3 pb-8">
        {error !== null && (
          <div className="w-full max-w-sm rounded-md border border-danger/30 bg-danger-soft p-3 text-center">
            <p className="mb-2 text-sm text-danger">Could not load more products.</p>
            <Button variant="secondary" size="sm" onClick={loadMore}>
              Try again
            </Button>
          </div>
        )}

        {hasNextPage && error === null && (
          <Button variant="secondary" onClick={loadMore} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? 'Loading…' : 'Load more products'}
          </Button>
        )}

        {!hasNextPage && (
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
      <p className="text-sm text-fg-muted">Try widening the price range or clearing a filter.</p>
    </div>
  );
}
