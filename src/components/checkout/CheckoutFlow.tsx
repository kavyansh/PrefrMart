'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useCart } from '@/components/cart/CartProvider';
import { AddressStep, type AddressDraft } from '@/components/checkout/AddressStep';
import { DeliveryStep } from '@/components/checkout/DeliveryStep';
import { PaymentStep, type PaymentDraft } from '@/components/checkout/PaymentStep';
import { ReviewStep } from '@/components/checkout/ReviewStep';
import { computeTotals, formatMoney, type DeliveryOption } from '@/lib/money';

/**
 * Multi-step checkout: address → delivery → payment → review.
 *
 * One client component owning the whole flow rather than four routes. The steps share a draft that
 * only means anything together, and routing between them would mean either persisting a half-filled
 * order server-side or losing it on a refresh.
 *
 * Totals are computed with the same `computeTotals` the order API uses, so the figure shown on the
 * review step and the figure recorded on the order come from one implementation. Two would drift.
 *
 * The idempotency key is generated once per mounted flow, not per submit. That is what makes a
 * double-tapped Place Order produce one order: both requests carry the same key, and the second is
 * answered with the first one's result.
 */

export type SavedAddress = {
  id: string;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
};

const STEPS = ['address', 'delivery', 'payment', 'review'] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  address: 'Delivery address',
  delivery: 'Delivery speed',
  payment: 'Payment',
  review: 'Review',
};

export function CheckoutFlow({
  savedAddresses,
  defaultName,
}: {
  savedAddresses: SavedAddress[];
  defaultName: string;
}) {
  const router = useRouter();
  const { view, isLoading, refresh } = useCart();

  const [step, setStep] = useState<Step>('address');
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    savedAddresses.find((address) => address.isDefault)?.id ?? savedAddresses[0]?.id ?? null,
  );
  const [newAddress, setNewAddress] = useState<AddressDraft | null>(null);
  const [deliveryOption, setDeliveryOption] = useState<DeliveryOption>('standard');
  const [payment, setPayment] = useState<PaymentDraft | null>(null);

  const [isPlacing, setIsPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  /*
   * Generated once when the flow mounts. A key per submit would defeat the point: two taps would
   * carry two keys and create two orders.
   */
  const idempotencyKey = useMemo(
    () => `co-${crypto.randomUUID().replace(/-/g, '')}`,
    [],
  );

  const purchasable = useMemo(
    () => (view?.lines ?? []).filter((line) => line.qty > 0),
    [view],
  );

  const totals = useMemo(
    () =>
      computeTotals(
        purchasable.map((line) => ({ unitCents: line.unitCents, qty: line.qty })),
        deliveryOption,
      ),
    [purchasable, deliveryOption],
  );

  const placeOrder = useCallback(async () => {
    if (payment === null) return;

    setIsPlacing(true);
    setPlaceError(null);

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          deliveryOption,
          // Exactly one of these; the API rejects both or neither.
          ...(newAddress === null ? { addressId: selectedAddressId } : { address: newAddress }),
          paymentLabel: payment.label,
        }),
      });

      if (response.ok) {
        const payload = (await response.json()) as { orderId: string };
        // The cart is emptied server-side by the same transaction; refresh so the badge and any
        // cart view agree with that immediately.
        await refresh();
        router.replace(`/orders/${payload.orderId}?placed=1`);
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setPlaceError(payload?.error?.message ?? 'Could not place your order.');

      // A stock rejection means the cart view is stale; re-read it so the shopper sees why.
      await refresh();
    } catch {
      setPlaceError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsPlacing(false);
    }
  }, [payment, idempotencyKey, deliveryOption, newAddress, selectedAddressId, refresh, router]);

  if (isLoading && view === null) {
    return <p className="text-sm text-fg-muted">Loading your cart…</p>;
  }

  if (purchasable.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-12 text-center">
        <p className="mb-1 text-base font-medium">There is nothing to check out</p>
        <p className="mb-4 text-sm text-fg-muted">Your cart is empty or its items are unavailable.</p>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-md border border-accent-strong bg-accent px-4 font-medium text-accent-fg"
        >
          Browse the catalog
        </Link>
      </div>
    );
  }

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="lg:flex lg:items-start lg:gap-8">
      <div className="min-w-0 flex-1">
        {/* Progress. `aria-current="step"` is how a screen reader conveys position in a flow. */}
        <ol className="mb-6 flex flex-wrap gap-2 text-sm">
          {STEPS.map((candidate, index) => {
            const isDone = index < stepIndex;
            const isCurrent = candidate === step;
            return (
              <li key={candidate} className="flex items-center gap-2">
                <button
                  type="button"
                  // Completed steps stay reachable; future ones do not, since their inputs
                  // depend on earlier answers.
                  disabled={!isDone && !isCurrent}
                  onClick={() => setStep(candidate)}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={
                    isCurrent
                      ? 'min-h-11 rounded-md bg-ink px-3 font-medium text-fg-inverse'
                      : isDone
                        ? 'min-h-11 rounded-md px-3 text-info underline'
                        : 'min-h-11 px-3 text-fg-subtle'
                  }
                >
                  <span className="sr-only">Step {index + 1}: </span>
                  {STEP_LABELS[candidate]}
                  {isDone && <span className="sr-only"> (completed)</span>}
                </button>
                {index < STEPS.length - 1 && <span aria-hidden="true" className="text-fg-subtle">›</span>}
              </li>
            );
          })}
        </ol>

        {step === 'address' && (
          <AddressStep
            savedAddresses={savedAddresses}
            defaultName={defaultName}
            selectedAddressId={selectedAddressId}
            newAddress={newAddress}
            onSelectSaved={(id) => {
              setSelectedAddressId(id);
              setNewAddress(null);
            }}
            onUseNew={(draft) => {
              setNewAddress(draft);
              setSelectedAddressId(null);
            }}
            onContinue={() => setStep('delivery')}
          />
        )}

        {step === 'delivery' && (
          <DeliveryStep
            value={deliveryOption}
            subtotalCents={totals.subtotalCents}
            onChange={setDeliveryOption}
            onBack={() => setStep('address')}
            onContinue={() => setStep('payment')}
          />
        )}

        {step === 'payment' && (
          <PaymentStep
            onBack={() => setStep('delivery')}
            onContinue={(draft) => {
              setPayment(draft);
              setStep('review');
            }}
          />
        )}

        {step === 'review' && (
          <ReviewStep
            lines={purchasable}
            totals={totals}
            deliveryOption={deliveryOption}
            address={
              newAddress ?? savedAddresses.find((candidate) => candidate.id === selectedAddressId) ?? null
            }
            paymentLabel={payment?.label ?? ''}
            isPlacing={isPlacing}
            error={placeError}
            onBack={() => setStep('payment')}
            onPlace={placeOrder}
          />
        )}
      </div>

      <aside
        aria-labelledby="checkout-summary"
        className="mt-6 lg:sticky lg:top-20 lg:mt-0 lg:w-72 lg:shrink-0"
      >
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 id="checkout-summary" className="mb-3 text-base font-semibold">
            Order summary
          </h2>
          <OrderTotals totals={totals} currency={view?.currency ?? 'INR'} itemCount={view?.itemCount ?? 0} />
        </div>
      </aside>
    </div>
  );
}

function OrderTotals({
  totals,
  currency,
  itemCount,
}: {
  totals: ReturnType<typeof computeTotals>;
  currency: string;
  itemCount: number;
}) {
  return (
    <dl className="space-y-1.5 text-sm">
      <Row label={`Subtotal (${itemCount} ${itemCount === 1 ? 'item' : 'items'})`} value={totals.subtotalCents} currency={currency} />
      <Row label="Delivery" value={totals.shippingCents} currency={currency} free />
      <Row label="Tax" value={totals.taxCents} currency={currency} />
      <div className="border-t border-border pt-1.5">
        <Row label="Total" value={totals.totalCents} currency={currency} emphasis />
      </div>
    </dl>
  );
}

function Row({
  label,
  value,
  currency,
  emphasis = false,
  free = false,
}: {
  label: string;
  value: number;
  currency: string;
  emphasis?: boolean;
  free?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={emphasis ? 'font-semibold' : 'text-fg-muted'}>{label}</dt>
      <dd className={emphasis ? 'font-semibold' : ''}>
        {free && value === 0 ? 'Free' : formatMoney(value, currency)}
      </dd>
    </div>
  );
}
