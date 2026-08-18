'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { SavedAddress } from '@/components/checkout/CheckoutFlow';

/** A new address the shopper typed. Matches the API's `address` shape. */
export type AddressDraft = {
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
};

type FieldErrors = Partial<Record<keyof AddressDraft, string>>;

/**
 * Step 1: choose a saved address or enter a new one.
 *
 * Saved addresses are radio inputs, not clickable cards with a hidden input — this is a
 * single-choice control and radios give arrow-key navigation and correct announcement for free.
 */
export function AddressStep({
  savedAddresses,
  defaultName,
  selectedAddressId,
  newAddress,
  onSelectSaved,
  onUseNew,
  onContinue,
}: {
  savedAddresses: SavedAddress[];
  defaultName: string;
  selectedAddressId: string | null;
  newAddress: AddressDraft | null;
  onSelectSaved: (id: string) => void;
  onUseNew: (draft: AddressDraft) => void;
  onContinue: () => void;
}) {
  // Someone with no saved address goes straight to the form; making them click "add new" first
  // is a step that only ever has one answer.
  const [mode, setMode] = useState<'saved' | 'new'>(
    savedAddresses.length === 0 || newAddress !== null ? 'new' : 'saved',
  );

  const [draft, setDraft] = useState<AddressDraft>(
    newAddress ?? {
      fullName: defaultName,
      line1: '',
      line2: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'IN',
      phone: '',
    },
  );
  const [errors, setErrors] = useState<FieldErrors>({});

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    if (draft.fullName.trim() === '') found.fullName = 'Enter a name.';
    if (draft.line1.trim() === '') found.line1 = 'Enter the address.';
    if (draft.city.trim() === '') found.city = 'Enter a city.';
    if (draft.state.trim() === '') found.state = 'Enter a state.';
    if (draft.postalCode.trim().length < 4) found.postalCode = 'Enter a valid postcode.';
    if (draft.phone.trim().length < 6) found.phone = 'Enter a phone number.';
    return found;
  }

  function handleContinue() {
    if (mode === 'saved') {
      if (selectedAddressId === null) {
        setErrors({ line1: 'Choose an address.' });
        return;
      }
      onContinue();
      return;
    }

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    onUseNew({ ...draft, line2: draft.line2?.trim() === '' ? undefined : draft.line2?.trim() });
    onContinue();
  }

  return (
    <section aria-labelledby="address-heading" className="rounded-lg border border-border bg-surface p-4">
      <h2 id="address-heading" className="mb-4 text-base font-semibold">
        Where should we deliver?
      </h2>

      {savedAddresses.length > 0 && (
        <>
          <fieldset className="mb-4">
            <legend className="mb-2 text-sm font-medium">Saved addresses</legend>
            <div className="space-y-2">
              {savedAddresses.map((address) => (
                <label
                  key={address.id}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-md border p-3 text-sm',
                    mode === 'saved' && selectedAddressId === address.id
                      ? 'border-ink bg-surface-sunken'
                      : 'border-border',
                  )}
                >
                  <input
                    type="radio"
                    name="address-choice"
                    checked={mode === 'saved' && selectedAddressId === address.id}
                    onChange={() => {
                      setMode('saved');
                      onSelectSaved(address.id);
                    }}
                    className="mt-0.5 h-4 w-4 accent-ink"
                  />
                  <span>
                    <span className="block font-medium">{address.fullName}</span>
                    <span className="text-fg-muted">
                      {address.line1}
                      {address.line2 !== null && `, ${address.line2}`}, {address.city},{' '}
                      {address.state} {address.postalCode} · {address.phone}
                    </span>
                  </span>
                </label>
              ))}

              <label
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm',
                  mode === 'new' ? 'border-ink bg-surface-sunken' : 'border-border',
                )}
              >
                <input
                  type="radio"
                  name="address-choice"
                  checked={mode === 'new'}
                  onChange={() => setMode('new')}
                  className="h-4 w-4 accent-ink"
                />
                Use a different address
              </label>
            </div>
          </fieldset>
        </>
      )}

      {mode === 'new' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="fullName"
            label="Full name"
            value={draft.fullName}
            onChange={(value) => setDraft({ ...draft, fullName: value })}
            autoComplete="name"
            error={errors.fullName}
            className="sm:col-span-2"
          />
          <Field
            id="line1"
            label="Address"
            value={draft.line1}
            onChange={(value) => setDraft({ ...draft, line1: value })}
            autoComplete="address-line1"
            error={errors.line1}
            className="sm:col-span-2"
          />
          <Field
            id="line2"
            label="Apartment, floor (optional)"
            value={draft.line2 ?? ''}
            onChange={(value) => setDraft({ ...draft, line2: value })}
            autoComplete="address-line2"
            className="sm:col-span-2"
          />
          <Field
            id="city"
            label="City"
            value={draft.city}
            onChange={(value) => setDraft({ ...draft, city: value })}
            autoComplete="address-level2"
            error={errors.city}
          />
          <Field
            id="state"
            label="State"
            value={draft.state}
            onChange={(value) => setDraft({ ...draft, state: value })}
            autoComplete="address-level1"
            error={errors.state}
          />
          <Field
            id="postalCode"
            label="Postcode"
            value={draft.postalCode}
            onChange={(value) => setDraft({ ...draft, postalCode: value })}
            autoComplete="postal-code"
            inputMode="numeric"
            error={errors.postalCode}
          />
          <Field
            id="phone"
            label="Phone"
            value={draft.phone}
            onChange={(value) => setDraft({ ...draft, phone: value })}
            autoComplete="tel"
            inputMode="tel"
            error={errors.phone}
          />
        </div>
      )}

      <div className="mt-5">
        <Button onClick={handleContinue} size="lg">
          Continue to delivery
        </Button>
      </div>
    </section>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  autoComplete,
  inputMode,
  error,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  autoComplete?: string;
  inputMode?: 'numeric' | 'tel';
  error?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={`addr-${id}`} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={`addr-${id}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // autoComplete tokens are what let a browser fill a whole address in one tap.
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? `addr-${id}-error` : undefined}
        className="min-h-11 w-full rounded-md border border-border bg-surface px-3"
      />
      {error !== undefined && (
        <p id={`addr-${id}-error`} className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
