import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { CheckoutFlow } from '@/components/checkout/CheckoutFlow';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { loginUrlFor } from '@/lib/auth/redirect';
import { db } from '@/lib/db';

/**
 * Checkout.
 *
 * The proxy already redirects unauthenticated requests here; this re-check exists because the proxy
 * only verifies the token's signature, so a valid token for a since-deleted user gets past it.
 *
 * A guest who reaches this page is sent to sign-in and lands back here afterwards, at which point
 * the cart provider merges their guest basket into the account cart. That ordering matters: the
 * merge has to happen before the order is placed from the server cart.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  const user = await getCurrentUser();
  if (user === null) redirect(loginUrlFor('/checkout'));

  const addresses = await db.address.findMany({
    where: { userId: user.id },
    // Default first, then newest, so the most likely choice is preselected.
    orderBy: [{ isDefault: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      fullName: true,
      line1: true,
      line2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      phone: true,
      isDefault: true,
    },
  });

  return (
    <main id="main" className="mx-auto max-w-(--container-page) px-3 py-4 sm:px-4">
      <h1 className="mb-4 text-xl font-semibold sm:text-2xl">Checkout</h1>
      <CheckoutFlow savedAddresses={addresses} defaultName={user.name} />
    </main>
  );
}
