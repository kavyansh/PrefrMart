'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { OrderStatusBadge } from '@/components/account/OrderStatusBadge';
import { useCursorPagination } from '@/hooks/useCursorPagination';
import { formatMoney } from '@/lib/money';
import { imageSrc } from '@/lib/catalog/taxonomy';
import type { OrderSummary } from '@/lib/orders/queries';
import type { Page } from '@/lib/pagination';

/**
 * Order history, cursor-paginated by the same hook as the catalog and reviews.
 *
 * Three consumers now share one pagination contract. That is the payoff for defining
 * `{ items, nextCursor }` once: loading, de-duplication, abort-on-unmount and retry behaviour
 * are identical everywhere, and a fix to any of them applies to all three.
 *
 * No `storageKey`: order history is short and private, and persisting it into sessionStorage
 * would leave purchase data on a shared machine after signing out.
 */
export function OrderHistoryList({
  initialPage,
  totalCount,
}: {
  initialPage: Page<OrderSummary>;
  totalCount: number;
}) {
  const fetchPage = useCallback(
    async (cursor: string, signal: AbortSignal): Promise<Page<OrderSummary>> => {
      const response = await fetch(`/api/account/orders?cursor=${encodeURIComponent(cursor)}`, {
        signal,
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Orders request failed with ${response.status}`);
      return (await response.json()) as Page<OrderSummary>;
    },
    [],
  );

  const { items, isLoading, error, hasMore, loadMore } = useCursorPagination<OrderSummary>({
    initialPage,
    fetchPage,
  });

  if (totalCount === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-12 text-center">
        <p className="mb-1 text-base font-medium">No orders yet</p>
        <p className="mb-4 text-sm text-fg-muted">Anything you order will show up here.</p>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-md border border-accent-strong bg-accent px-4 font-medium text-accent-fg"
        >
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div>
      <ul className="space-y-3">
        {items.map((order) => (
          <li key={order.id}>
            <article className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{order.number}</p>
                  <p className="text-xs text-fg-subtle">
                    Placed{' '}
                    <time dateTime={order.placedAt}>
                      {new Date(order.placedAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </time>
                  </p>
                </div>
                <OrderStatusBadge status={order.status} />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  {order.previewImages.map((image) => (
                    <div
                      key={image}
                      className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border"
                    >
                      <Image src={imageSrc(image)} alt="" fill sizes="48px" className="object-cover" />
                    </div>
                  ))}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{order.firstItemTitle}</p>
                  <p className="text-xs text-fg-muted">
                    {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'} ·{' '}
                    {formatMoney(order.totalCents, order.currency)}
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <Link
                  href={`/orders/${order.id}`}
                  className="inline-flex min-h-11 items-center text-sm text-info underline"
                >
                  {/* Names the specific order, so a list of these is not a row of
                      identical "View details" links to a screen reader. */}
                  View details<span className="sr-only"> for order {order.number}</span>
                </Link>
              </div>
            </article>
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
            {isLoading ? 'Loading…' : 'Show older orders'}
          </Button>
        )}
      </div>
    </div>
  );
}
