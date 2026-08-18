'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { imageSrc } from '@/lib/catalog/taxonomy';
import { formatMoney, type DeliveryOption, type OrderTotals } from '@/lib/money';
import type { CartLineView } from '@/lib/cart/types';
import type { AddressDraft } from '@/components/checkout/AddressStep';
import type { SavedAddress } from '@/components/checkout/CheckoutFlow';

/**
 * Step 4: review and place.
 *
 * Everything the shopper is agreeing to is on one screen — items, address, speed, payment label and
 * the full total breakdown. A confirmation step that hides any of those is asking for a chargeback.
 *
 * The Place Order button disables while the request is in flight, but that is only the visible half
 * of double-submit protection. The real guarantee is the idempotency key the flow generated once on
 * mount: even if two requests get out, the second is answered with the first one's order.
 */
export function ReviewStep({
  lines,
  totals,
  deliveryOption,
  address,
  paymentLabel,
  isPlacing,
  error,
  onBack,
  onPlace,
}: {
  lines: CartLineView[];
  totals: OrderTotals;
  deliveryOption: DeliveryOption;
  address: AddressDraft | SavedAddress | null;
  paymentLabel: string;
  isPlacing: boolean;
  error: string | null;
  onBack: () => void;
  onPlace: () => void;
}) {
  const currency = lines[0]?.currency ?? 'INR';

  return (
    <section aria-labelledby="review-heading" className="rounded-lg border border-border bg-surface p-4">
      <h2 id="review-heading" className="mb-4 text-base font-semibold">
        Check everything over
      </h2>

      <ul className="mb-5 divide-y divide-border">
        {lines.map((line) => (
          <li key={line.productId} className="flex gap-3 py-3 first:pt-0">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border">
              {line.image !== '' && (
                <Image src={imageSrc(line.image)} alt="" fill sizes="56px" className="object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium">{line.title}</p>
              <p className="text-xs text-fg-muted">
                {formatMoney(line.unitCents, line.currency)} × {line.qty}
              </p>
            </div>
            <p className="text-sm font-medium">{formatMoney(line.lineCents, line.currency)}</p>
          </li>
        ))}
      </ul>

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-semibold">Delivering to</h3>
          {address === null ? (
            <p className="text-sm text-danger">No address selected.</p>
          ) : (
            <address className="text-sm not-italic text-fg-muted">
              <span className="block text-fg">{address.fullName}</span>
              {address.line1}
              {address.line2 !== null && address.line2 !== undefined && address.line2 !== '' && (
                <>
                  <br />
                  {address.line2}
                </>
              )}
              <br />
              {address.city}, {address.state} {address.postalCode}
              <br />
              {address.phone}
            </address>
          )}
        </div>

        <div>
          <h3 className="mb-1 text-sm font-semibold">Delivery and payment</h3>
          <p className="text-sm text-fg-muted">
            {deliveryOption === 'express' ? 'Express (1-2 days)' : 'Standard (3-5 days)'}
            <br />
            {paymentLabel}
          </p>
        </div>
      </div>

      <dl className="mb-5 space-y-1.5 border-t border-border pt-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">Subtotal</dt>
          <dd>{formatMoney(totals.subtotalCents, currency)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">Delivery</dt>
          <dd>{totals.shippingCents === 0 ? 'Free' : formatMoney(totals.shippingCents, currency)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">Tax</dt>
          <dd>{formatMoney(totals.taxCents, currency)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-border pt-1.5 text-base">
          <dt className="font-semibold">Total</dt>
          <dd className="font-semibold">{formatMoney(totals.totalCents, currency)}</dd>
        </div>
      </dl>

      {error !== null && (
        <p role="alert" className="mb-3 rounded-md bg-danger-soft p-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack} size="lg" disabled={isPlacing}>
          Back
        </Button>
        <Button onClick={onPlace} size="lg" disabled={isPlacing || address === null}>
          {isPlacing ? 'Placing order…' : `Place order · ${formatMoney(totals.totalCents, currency)}`}
        </Button>
      </div>

      <p aria-live="polite" className="sr-only">
        {isPlacing ? 'Placing your order' : ''}
      </p>
    </section>
  );
}
