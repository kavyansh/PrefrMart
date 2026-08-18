import { Suspense } from 'react';
import { Header } from '@/components/layout/Header';
import { ProductCard } from '@/components/product/ProductCard';
import { ProductGridSkeleton } from '@/components/ui/Skeleton';
import { listProducts } from '@/lib/catalog/products';

/**
 * Home / product listing.
 *
 * Phase 1 renders the first page server-side to prove the data path end to end.
 * Phase 2 replaces the static grid with the cursor-driven infinite scroll client,
 * keeping this server-rendered first page as its initial state.
 */

/**
 * Rendered per request, not statically.
 *
 * This is a security requirement, not a preference: our CSP is nonce-based, and Next can
 * only stamp a per-request nonce onto its inline hydration scripts when the response is
 * dynamic. A prerendered page's HTML predates the request, so it carries no nonce — and
 * the only way to let those inline scripts run would be `'unsafe-inline'`, which is
 * precisely the hole that makes XSS exploitable.
 *
 * The cost is real but small here: the catalog query is indexed and local, so the added
 * server time is a few milliseconds against a 2.5s LCP target. See README.
 */
export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <>
      <Header />

      <main id="main" className="mx-auto max-w-(--container-page) px-3 py-4 sm:px-4">
        <h1 className="mb-4 text-xl font-semibold">Fresh in the catalog</h1>

        {/* Streamed: the header and heading paint before the query resolves. */}
        <Suspense fallback={<ProductGridSkeleton count={12} />}>
          <FirstPage />
        </Suspense>
      </main>
    </>
  );
}

async function FirstPage() {
  const { items } = await listProducts({ limit: 24, sort: 'newest' });

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          // Only the first row can be the LCP element.
          priority={index < 4}
        />
      ))}
    </div>
  );
}
