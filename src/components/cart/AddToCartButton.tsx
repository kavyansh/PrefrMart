'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAddItem } from '@/lib/cart/store';

/**
 * Add to cart, from the product page.
 *
 * The confirmation is announced through a live region rather than by navigating to the cart. Being
 * thrown out of the product page after adding one thing is hostile to anyone still browsing — and
 * the header badge already shows the change.
 */
export function AddToCartButton({
  productId,
  stock,
  productTitle,
}: {
  productId: string;
  stock: number;
  /** Used only in the announcement, so it names what was added. */
  productTitle: string;
}) {
  const addItem = useAddItem();
  const [state, setState] = useState<'idle' | 'adding' | 'added'>('idle');

  if (stock === 0) {
    return (
      <Button disabled fullWidth size="lg">
        Out of stock
      </Button>
    );
  }

  async function handleAdd() {
    setState('adding');
    try {
      await addItem(productId, 1);
      setState('added');
      // Return to idle so the button can be used again; the badge carries the running total.
      setTimeout(() => setState('idle'), 2500);
    } catch {
      setState('idle');
    }
  }

  return (
    <div>
      <Button onClick={handleAdd} disabled={state === 'adding'} fullWidth size="lg">
        {state === 'adding' ? 'Adding…' : state === 'added' ? 'Added to cart' : 'Add to cart'}
      </Button>

      <p aria-live="polite" className="sr-only">
        {state === 'added' ? `${productTitle} added to your cart` : ''}
      </p>
    </div>
  );
}
