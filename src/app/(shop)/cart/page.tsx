import type { Metadata } from 'next';
import { CartContents } from '@/components/cart/CartContents';

/**
 * The cart page.
 *
 * Not auth-guarded: a guest has a real cart, held in IndexedDB, and being forced to sign in before
 * seeing what they picked is the surest way to lose the sale. Sign-in is required at checkout, and
 * the guest basket is merged into the account cart at that point.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your cart',
  // A cart is per-visitor and has nothing to index.
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return (
    <main id="main" className="mx-auto max-w-(--container-page) px-3 py-4 sm:px-4">
      <h1 className="mb-4 text-xl font-semibold sm:text-2xl">Your cart</h1>
      <CartContents />
    </main>
  );
}
