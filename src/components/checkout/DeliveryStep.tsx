'use client';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import {
  EXPRESS_SHIPPING_CENTS,
  formatMoney,
  shippingFor,
  type DeliveryOption,
} from '@/lib/money';

/**
 * Step 2: delivery speed.
 *
 * Prices come from `shippingFor`, the same function the order API uses, so the quote shown here is
 * the amount actually charged — including the free-delivery threshold, which a hardcoded label
 * would get wrong for exactly the baskets where it matters.
 */
export function DeliveryStep({
  value,
  subtotalCents,
  onChange,
  onBack,
  onContinue,
}: {
  value: DeliveryOption;
  subtotalCents: number;
  onChange: (next: DeliveryOption) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const standardCost = shippingFor(subtotalCents, 'standard');

  const options: Array<{ id: DeliveryOption; title: string; detail: string; cost: number }> = [
    {
      id: 'standard',
      title: 'Standard delivery',
      detail: 'Arrives in 3-5 working days',
      cost: standardCost,
    },
    {
      id: 'express',
      title: 'Express delivery',
      detail: 'Arrives in 1-2 working days',
      cost: EXPRESS_SHIPPING_CENTS,
    },
  ];

  return (
    <section aria-labelledby="delivery-heading" className="rounded-lg border border-border bg-surface p-4">
      <h2 id="delivery-heading" className="mb-4 text-base font-semibold">
        How fast do you need it?
      </h2>

      <fieldset>
        <legend className="sr-only">Delivery speed</legend>
        <div className="space-y-2">
          {options.map((option) => (
            <label
              key={option.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-md border p-3',
                value === option.id ? 'border-ink bg-surface-sunken' : 'border-border',
              )}
            >
              <input
                type="radio"
                name="delivery"
                checked={value === option.id}
                onChange={() => onChange(option.id)}
                className="mt-0.5 h-4 w-4 accent-ink"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium">{option.title}</span>
                <span className="block text-sm text-fg-muted">{option.detail}</span>
              </span>
              <span className="text-sm font-medium">
                {option.cost === 0 ? 'Free' : formatMoney(option.cost)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 flex gap-2">
        <Button variant="secondary" onClick={onBack} size="lg">
          Back
        </Button>
        <Button onClick={onContinue} size="lg">
          Continue to payment
        </Button>
      </div>
    </section>
  );
}
