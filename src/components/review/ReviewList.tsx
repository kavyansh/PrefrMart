'use client';

import { useCallback, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Rating } from '@/components/ui/Rating';
import { useCursorPagination } from '@/hooks/useCursorPagination';
import type { ReviewItem } from '@/lib/catalog/reviews';
import type { Page } from '@/lib/pagination';
import type { ReviewSort } from '@/lib/catalog/sorts';

/**
 * Cursor-paginated, sortable review list.
 *
 * Reuses `useCursorPagination` — the same hook driving the product grid. Reviews and products
 * share one pagination contract (`{ items, nextCursor }`), so they can share the loading,
 * de-duplication, abort and retry behaviour rather than growing a second implementation.
 *
 * No sessionStorage key here: unlike the catalog, nobody navigates away from a review list
 * and expects to return to page four of it, and persisting review pages would spend the
 * storage quota that the listing genuinely needs.
 */

const SORT_LABELS: Record<ReviewSort, string> = {
  newest: 'Most recent',
  highest: 'Highest rated',
  lowest: 'Lowest rated',
};

const SORTS: readonly ReviewSort[] = ['newest', 'highest', 'lowest'];

export function ReviewList({
  productSlug,
  initialPage,
  totalCount,
}: {
  productSlug: string;
  initialPage: Page<ReviewItem>;
  totalCount: number;
}) {
  const [sort, setSort] = useState<ReviewSort>('newest');
  const [sortedPage, setSortedPage] = useState<Page<ReviewItem>>(initialPage);
  const [isSorting, setIsSorting] = useState(false);

  const fetchPage = useCallback(
    async (cursor: string, signal: AbortSignal): Promise<Page<ReviewItem>> => {
      const response = await fetch(
        `/api/products/${productSlug}/reviews?sort=${sort}&cursor=${encodeURIComponent(cursor)}`,
        { signal, headers: { accept: 'application/json' } },
      );
      if (!response.ok) throw new Error(`Reviews request failed with ${response.status}`);
      return (await response.json()) as Page<ReviewItem>;
    },
    [productSlug, sort],
  );

  const { items, isLoading, error, hasMore, loadMore } = useCursorPagination<ReviewItem>({
    // Remounting on sort change (via `key` below) resets the accumulated items, so this is
    // always the correct first page for the active sort.
    initialPage: sortedPage,
    fetchPage,
  });

  /*
   * Changing sort re-fetches page one. This is a plain fetch rather than a navigation because
   * review sort is not URL state — it is a local view preference, and putting it in the URL
   * would mean a shared product link carried someone else's sort choice.
   */
  const changeSort = useCallback(
    async (next: ReviewSort) => {
      setIsSorting(true);
      try {
        const response = await fetch(
          `/api/products/${productSlug}/reviews?sort=${next}`,
          { headers: { accept: 'application/json' } },
        );
        if (!response.ok) throw new Error(`Reviews request failed with ${response.status}`);
        setSortedPage((await response.json()) as Page<ReviewItem>);
        setSort(next);
      } catch {
        // Leave the current list in place; the select snaps back to the active sort.
      } finally {
        setIsSorting(false);
      }
    },
    [productSlug],
  );

  if (totalCount === 0) {
    return (
      <p className="text-sm text-fg-muted">
        No reviews yet. If you have used this product, yours would be the first.
      </p>
    );
  }

  return (
    <div key={sort}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          {totalCount.toLocaleString('en-IN')} {totalCount === 1 ? 'review' : 'reviews'}
        </p>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-fg-muted">Sort</span>
          <select
            value={sort}
            disabled={isSorting}
            onChange={(event) => void changeSort(event.target.value as ReviewSort)}
            className="min-h-11 rounded-md border border-border bg-surface px-2 text-sm"
          >
            {SORTS.map((option) => (
              <option key={option} value={option}>
                {SORT_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="space-y-4">
        {items.map((review) => (
          <li key={review.id} className="border-b border-border pb-4 last:border-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Rating value={review.rating} count={1} size="sm" hideCount />
              <h4 className="text-sm font-semibold">{review.title}</h4>
              {review.isOwn && <Badge tone="info">Your review</Badge>}
            </div>

            <p className="mb-2 text-xs text-fg-subtle">
              {review.authorName} ·{' '}
              <time dateTime={review.createdAt}>
                {new Date(review.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </time>
            </p>

            {/*
              Rendered as a text node: React escapes it, so a review body containing markup
              appears as literal characters rather than executing.
            */}
            <p className="text-sm whitespace-pre-line text-fg">{review.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-col items-center gap-2">
        {error !== null && (
          <div className="w-full max-w-sm rounded-md border border-danger/30 bg-danger-soft p-3 text-center">
            <p className="mb-2 text-sm text-danger">{error}</p>
            <Button variant="secondary" size="sm" onClick={loadMore}>
              Try again
            </Button>
          </div>
        )}

        {hasMore && error === null && (
          <Button variant="secondary" size="sm" onClick={loadMore} disabled={isLoading}>
            {isLoading ? 'Loading…' : 'Show more reviews'}
          </Button>
        )}
      </div>

      <p aria-live="polite" className="sr-only">
        {isLoading || isSorting ? 'Loading reviews' : `${items.length} reviews shown`}
      </p>
    </div>
  );
}
