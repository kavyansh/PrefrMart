import { CatalogPage } from '@/components/catalog/CatalogPage';
import { parseFilters } from '@/lib/catalog/query';

/**
 * Home — the unfiltered product listing.
 *
 * Rendered per request, not statically. This is a security requirement, not a preference:
 * our CSP is nonce-based, and Next can only stamp a per-request nonce onto its inline
 * hydration scripts when the response is dynamic. A prerendered page's HTML predates the
 * request, so it carries no nonce — and the only way to let those inline scripts run
 * would be `'unsafe-inline'`, which is precisely the hole that makes XSS exploitable.
 *
 * The cost is small: the catalog query is indexed and local, a few milliseconds against a
 * 2.5s LCP target. See README and tests/security.test.ts.
 */
export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(toParams(await searchParams));

  return (
    <CatalogPage
      heading="Everyday essentials"
      intro="Browse the full catalog. Scroll to keep loading, or use the button below the grid."
      filters={filters}
      basePath="/"
    />
  );
}

/** Collapse Next's searchParams shape into the flat map the filter parser expects. */
function toParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    // Repeated keys are not meaningful for any of our filters; take the first.
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  return params;
}
