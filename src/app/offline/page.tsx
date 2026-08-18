import Link from 'next/link';
import type { Metadata } from 'next';

/**
 * Offline fallback, served by the service worker when a navigation cannot reach the network and
 * nothing cached matches.
 *
 * It depends on no request, session or database query, so the service worker can fetch it once at
 * install time and replay it forever.
 *
 * It is still rendered per request like every other route — the root layout reads the session cookie
 * for the cart, which makes the whole tree dynamic. That is convenient here rather than a problem:
 * it means this page receives a CSP nonce like any other, and the service worker caches the response
 * together with its own CSP header, so a replayed copy stays internally consistent.
 *
 * It sits outside the `(shop)` group deliberately: no header, since the category rail needs a
 * database that is by definition unreachable when this page is shown.
 */
export const metadata: Metadata = {
  title: 'Offline',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-2 text-xl font-semibold">You are offline</h1>
      <p className="mb-6 text-sm text-fg-muted">
        We could not reach the network. Pages you have already visited are still available, and
        anything in your cart is saved on this device.
      </p>

      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-md border border-accent-strong bg-accent px-4 font-medium text-accent-fg"
        >
          Try the catalog
        </Link>
        <Link
          href="/cart"
          className="inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-4 font-medium"
        >
          View your cart
        </Link>
      </div>
    </main>
  );
}
