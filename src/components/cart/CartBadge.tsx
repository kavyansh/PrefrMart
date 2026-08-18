'use client';

import Link from 'next/link';
import { useCart } from '@/components/cart/CartProvider';

/**
 * Header cart link with a running item count.
 *
 * The count is announced as part of the link's accessible name rather than as a bare number, so a
 * screen reader says "Cart, 3 items" instead of "Cart 3" — and the visual badge is hidden from
 * assistive tech to avoid reading the figure twice.
 */
export function CartBadge() {
  const { itemCount } = useCart();

  return (
    <Link
      href="/cart"
      className="relative inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm hover:bg-ink-soft"
    >
      <CartIcon />
      <span className="hidden sm:inline">Cart</span>

      {itemCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-0.5 right-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-semibold text-accent-fg"
        >
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}

      <span className="sr-only">
        {itemCount === 0
          ? 'Cart, empty'
          : `Cart, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
      </span>
    </Link>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none">
      <path
        d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="20" r="1.4" fill="currentColor" />
      <circle cx="18" cy="20" r="1.4" fill="currentColor" />
    </svg>
  );
}
