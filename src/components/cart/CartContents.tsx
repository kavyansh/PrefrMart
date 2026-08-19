'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { QuantityStepper } from '@/components/cart/QuantityStepper';
import {
  useCartError,
  useCartIsLoading,
  useCartView,
  useRemoveItem,
  useSetQty,
} from '@/lib/cart/store';
import { imageSrc } from '@/lib/catalog/taxonomy';
import {
  FREE_SHIPPING_THRESHOLD_CENTS,
  formatMoney,
  shippingFor,
  STANDARD_SHIPPING_CENTS,
} from '@/lib/money';

/**
 * The cart page contents.
 *
 * Totals shown here are indicative and computed with the same `lib/money` helpers the order API
 * uses, so the figure a shopper sees at checkout is arrived at by the same code — not a second
 * implementation that can drift by a rupee.
 *
 * Out-of-stock and stock-reduced lines stay visible with an explanation. Silently dropping a line
 * or changing a quantity under the shopper reads as a bug and costs their trust in the total.
 */
export function CartContents() {
  const view = useCartView();
  const isLoading = useCartIsLoading();
  const error = useCartError();
  const setQty = useSetQty();
  const removeItem = useRemoveItem();

  if (isLoading && view === null) {
    return <CartSkeleton />;
  }

  if (view === null || view.lines.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-12 text-center">
        <p className="mb-1 text-base font-medium">Your cart is empty</p>
        <p className="mb-4 text-sm text-fg-muted">Anything you add will show up here.</p>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-md border border-accent-strong bg-accent px-4 font-medium text-accent-fg"
        >
          Browse the catalog
        </Link>
      </div>
    );
  }

  const purchasable = view.lines.filter((line) => line.qty > 0);
  const hasUnavailable = view.lines.some((line) => line.qty === 0);
  const shipping = shippingFor(view.subtotalCents, 'standard');
  const shortfall = FREE_SHIPPING_THRESHOLD_CENTS - view.subtotalCents;

  return (
    <div className="lg:flex lg:items-start lg:gap-8">
      <div className="min-w-0 flex-1">
        {error !== null && (
          <p role="alert" className="mb-3 rounded-md bg-danger-soft p-2.5 text-sm text-danger">
            {error}
          </p>
        )}

        {view.removedCount > 0 && (
          <p className="mb-3 rounded-md bg-warning-soft p-2.5 text-sm text-warning">
            {view.removedCount === 1
              ? 'An item was removed because it is no longer sold.'
              : `${view.removedCount} items were removed because they are no longer sold.`}
          </p>
        )}

        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {view.lines.map((line) => (
            <li key={line.productId} className="flex gap-3 p-3 sm:p-4">
              <Link
                href={`/p/${line.slug}`}
                className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-border sm:h-24 sm:w-24"
              >
                {line.image !== '' && (
                  <Image
                    src={imageSrc(line.image)}
                    alt=""
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                )}
              </Link>

              <div className="min-w-0 flex-1">
                <p className="text-xs text-fg-subtle">{line.brand}</p>
                <Link href={`/p/${line.slug}`} className="line-clamp-2 text-sm font-medium hover:underline">
                  {line.title}
                </Link>

                <p className="mt-1 text-sm">{formatMoney(line.unitCents, line.currency)}</p>

                {line.qty === 0 ? (
                  <Badge tone="danger" className="mt-2">
                    Out of stock
                  </Badge>
                ) : (
                  <>
                    {line.clampedFrom !== null && (
                      <p className="mt-1.5 text-xs text-warning">
                        {/* Says what changed and why, rather than silently altering the number. */}
                        Only {line.stock} left — quantity reduced from {line.clampedFrom}.
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <QuantityStepper
                        qty={line.qty}
                        max={line.stock}
                        productTitle={line.title}
                        onChange={(next) => void setQty(line.productId, next)}
                      />

                      <button
                        type="button"
                        onClick={() => void removeItem(line.productId)}
                        className="min-h-11 text-sm text-info underline"
                      >
                        Remove<span className="sr-only"> {line.title} from your cart</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              <p className="shrink-0 text-sm font-semibold">
                {formatMoney(line.lineCents, line.currency)}
              </p>
            </li>
          ))}
        </ul>

        {hasUnavailable && (
          <p className="mt-3 text-sm text-fg-muted">
            Out-of-stock items are not included in your total and will not be ordered.
          </p>
        )}
      </div>

      {/* Summary. Sticky on desktop so the total stays in view down a long cart. */}
      <aside
        aria-labelledby="summary-heading"
        className="mt-6 lg:sticky lg:top-20 lg:mt-0 lg:w-80 lg:shrink-0"
      >
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 id="summary-heading" className="mb-3 text-base font-semibold">
            Summary
          </h2>

          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">
                Subtotal ({view.itemCount} {view.itemCount === 1 ? 'item' : 'items'})
              </dt>
              <dd>{formatMoney(view.subtotalCents, view.currency)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-fg-muted">Standard delivery</dt>
              <dd>{shipping === 0 ? 'Free' : formatMoney(shipping, view.currency)}</dd>
            </div>
          </dl>

          {shortfall > 0 && (
            <p className="mt-2 text-xs text-fg-muted">
              Add {formatMoney(shortfall, view.currency)} more for free delivery.
            </p>
          )}

          <p className="mt-3 text-xs text-fg-subtle">
            Tax is calculated at checkout.
          </p>

          <div className="mt-4">
            {purchasable.length === 0 ? (
              <Button disabled fullWidth size="lg">
                Nothing available to order
              </Button>
            ) : (
              <Link
                href="/checkout"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-accent-strong bg-accent px-5 font-medium text-accent-fg"
              >
                Proceed to checkout
              </Link>
            )}
          </div>

          {/* Announces total changes as quantities are edited. */}
          <p aria-live="polite" aria-atomic="true" className="sr-only">
            Subtotal {formatMoney(view.subtotalCents, view.currency)}, {view.itemCount} items
          </p>
        </div>

        <p className="mt-3 text-xs text-fg-subtle">
          Free delivery over {formatMoney(FREE_SHIPPING_THRESHOLD_CENTS)}, otherwise{' '}
          {formatMoney(STANDARD_SHIPPING_CENTS)}.
        </p>
      </aside>
    </div>
  );
}

function CartSkeleton() {
  return (
    <div className="lg:flex lg:gap-8" aria-hidden="true">
      <div className="min-w-0 flex-1 space-y-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex gap-3 rounded-lg border border-border bg-surface p-4">
            <span className="h-24 w-24 shrink-0 animate-pulse rounded-md bg-border/60" />
            <div className="flex-1 space-y-2">
              <span className="block h-4 w-3/4 animate-pulse rounded bg-border/60" />
              <span className="block h-4 w-1/2 animate-pulse rounded bg-border/60" />
              <span className="block h-11 w-32 animate-pulse rounded bg-border/60" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 lg:mt-0 lg:w-80 lg:shrink-0">
        <span className="block h-48 animate-pulse rounded-lg bg-border/60" />
      </div>
    </div>
  );
}
