'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  checkExpiry,
  detectBrand,
  formatCardNumber,
  isCvcValid,
  isLuhnValid,
  paymentLabel,
} from '@/lib/checkout/card';

/** What the flow keeps from this step. Only a display label — never card data. */
export type PaymentDraft = {
  label: string;
};

type FieldErrors = Partial<Record<'number' | 'expiry' | 'cvc' | 'name', string>>;

/**
 * Step 3: mock payment.
 *
 * No card data leaves the browser. Validation is entirely local, and the only thing handed onward
 * is a label like "Visa ending 4242" — which is what the order stores and a receipt shows.
 *
 * The card number field is deliberately `autoComplete="off"` and never placed in a form that
 * submits: there is nothing to submit it to, and inviting a password manager to save a card against
 * a demo would be worse than useless.
 *
 * Luhn is the check that earns its place here. Length and brand checks pass a transposed pair of
 * digits; the checksum does not.
 */
export function PaymentStep({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: (draft: PaymentDraft) => void;
}) {
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const brand = detectBrand(number);

  function handleContinue() {
    const found: FieldErrors = {};

    if (!isLuhnValid(number)) {
      // One message for "too short" and "checksum failed": the shopper's action is the same
      // either way, which is to re-read the card.
      found.number = 'Check the card number.';
    }

    const expiryCheck = checkExpiry(expiry, new Date());
    if (!expiryCheck.valid) found.expiry = expiryCheck.reason;

    if (!isCvcValid(cvc, brand)) {
      found.cvc = brand === 'Amex' ? 'Amex security codes are 4 digits.' : 'Enter the 3-digit code.';
    }

    if (name.trim() === '') found.name = 'Enter the name on the card.';

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    // Only the label survives this function.
    onContinue({ label: paymentLabel(number) });
  }

  return (
    <section aria-labelledby="payment-heading" className="rounded-lg border border-border bg-surface p-4">
      <h2 id="payment-heading" className="mb-1 text-base font-semibold">
        Payment
      </h2>
      <p className="mb-4 text-sm text-fg-muted">
        This is a demo. No payment is taken and no card details are sent anywhere — use{' '}
        <code className="rounded bg-surface-sunken px-1">4242 4242 4242 4242</code>.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="card-number" className="mb-1.5 block text-sm font-medium">
            Card number
          </label>
          <input
            id="card-number"
            value={number}
            // Grouped as the user types; Amex groups 4-6-5.
            onChange={(event) => setNumber(formatCardNumber(event.target.value))}
            inputMode="numeric"
            // Nothing should offer to remember a demo card.
            autoComplete="off"
            aria-invalid={errors.number !== undefined}
            aria-describedby={errors.number !== undefined ? 'card-number-error' : undefined}
            placeholder="4242 4242 4242 4242"
            className="min-h-11 w-full rounded-md border border-border bg-surface px-3 font-mono"
          />
          {errors.number !== undefined && (
            <p id="card-number-error" className="mt-1 text-sm text-danger">
              {errors.number}
            </p>
          )}
          {number !== '' && errors.number === undefined && brand !== 'Card' && (
            <p className="mt-1 text-xs text-fg-subtle">{brand}</p>
          )}
        </div>

        <div>
          <label htmlFor="card-expiry" className="mb-1.5 block text-sm font-medium">
            Expiry (MM/YY)
          </label>
          <input
            id="card-expiry"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="12/29"
            maxLength={5}
            aria-invalid={errors.expiry !== undefined}
            aria-describedby={errors.expiry !== undefined ? 'card-expiry-error' : undefined}
            className="min-h-11 w-full rounded-md border border-border bg-surface px-3 font-mono"
          />
          {errors.expiry !== undefined && (
            <p id="card-expiry-error" className="mt-1 text-sm text-danger">
              {errors.expiry}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="card-cvc" className="mb-1.5 block text-sm font-medium">
            Security code
          </label>
          <input
            id="card-cvc"
            value={cvc}
            onChange={(event) => setCvc(event.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
            autoComplete="off"
            placeholder={brand === 'Amex' ? '1234' : '123'}
            aria-invalid={errors.cvc !== undefined}
            aria-describedby={errors.cvc !== undefined ? 'card-cvc-error' : undefined}
            className="min-h-11 w-full rounded-md border border-border bg-surface px-3 font-mono"
          />
          {errors.cvc !== undefined && (
            <p id="card-cvc-error" className="mt-1 text-sm text-danger">
              {errors.cvc}
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="card-name" className="mb-1.5 block text-sm font-medium">
            Name on card
          </label>
          <input
            id="card-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            aria-invalid={errors.name !== undefined}
            aria-describedby={errors.name !== undefined ? 'card-name-error' : undefined}
            className="min-h-11 w-full rounded-md border border-border bg-surface px-3"
          />
          {errors.name !== undefined && (
            <p id="card-name-error" className="mt-1 text-sm text-danger">
              {errors.name}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex gap-2">
        <Button variant="secondary" onClick={onBack} size="lg">
          Back
        </Button>
        <Button onClick={handleContinue} size="lg">
          Review order
        </Button>
      </div>
    </section>
  );
}
