'use client';

import { cn } from '@/lib/cn';
import { MAX_QTY_PER_LINE } from '@/lib/cart/types';

/**
 * Quantity control.
 *
 * Buttons plus a number input rather than a `<select>`: a select of ten options is fiddly on a
 * phone, and the buttons give a 44px target for each direction.
 *
 * The input keeps its own label (visually hidden) and the buttons name the product they affect, so
 * a cart with five rows does not present ten identical "Increase" buttons.
 */
export function QuantityStepper({
  qty,
  max,
  productTitle,
  onChange,
  disabled = false,
}: {
  qty: number;
  /** Available stock; the ceiling is the lower of this and the per-line cap. */
  max: number;
  productTitle: string;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const ceiling = Math.min(max, MAX_QTY_PER_LINE);

  return (
    <div className="inline-flex items-center rounded-md border border-border">
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        disabled={disabled || qty <= 1}
        aria-label={`Decrease quantity of ${productTitle}`}
        className={cn(
          'inline-flex h-11 w-11 items-center justify-center rounded-l-md text-lg',
          'disabled:opacity-40',
          'hover:bg-surface-sunken',
        )}
      >
        −
      </button>

      <label className="contents">
        <span className="sr-only">Quantity of {productTitle}</span>
        <input
          type="number"
          inputMode="numeric"
          value={qty}
          min={1}
          max={ceiling}
          disabled={disabled}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10);
            // Ignore intermediate empty/NaN states while typing rather than snapping to 1,
            // which would fight the user mid-edit.
            if (Number.isFinite(parsed)) onChange(Math.min(Math.max(parsed, 1), ceiling));
          }}
          className="h-11 w-12 border-x border-border bg-surface text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
      </label>

      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        disabled={disabled || qty >= ceiling}
        aria-label={`Increase quantity of ${productTitle}`}
        className={cn(
          'inline-flex h-11 w-11 items-center justify-center rounded-r-md text-lg',
          'disabled:opacity-40',
          'hover:bg-surface-sunken',
        )}
      >
        +
      </button>
    </div>
  );
}
