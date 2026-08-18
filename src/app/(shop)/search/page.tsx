import Link from 'next/link';
import type { Metadata } from 'next';
import { CatalogToolbar } from '@/components/catalog/CatalogToolbar';
import { ProductList } from '@/components/product/ProductList';
import { ImageSearchPanel } from '@/components/search/ImageSearchPanel';
import { CATEGORIES } from '@/lib/catalog/taxonomy';
import { countProducts, listProducts } from '@/lib/catalog/products';
import { parseFilters } from '@/lib/catalog/query';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';

/**
 * Search results.
 *
 * Reuses `listProducts({ q })` and the same `ProductList` as the catalog, so results paginate,
 * filter and sort identically. A separate search results implementation would be a second place for
 * pagination to be subtly wrong.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim();

  return {
    title: query ? `Search: ${query}` : 'Search',
    // Search result pages are thin, near-duplicate content; keeping them out of an index is
    // standard practice and avoids competing with the category pages.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }

  const filters = parseFilters(params);
  const query = filters.q;

  return (
    <main id="main" className="mx-auto max-w-(--container-page) px-3 py-4 sm:px-4">
      {query === undefined ? (
        <EmptyQueryState />
      ) : (
        <Results filters={filters} query={query} />
      )}

      <div className="mt-8">
        <ImageSearchPanel />
      </div>
    </main>
  );
}

async function Results({
  filters,
  query,
}: {
  filters: ReturnType<typeof parseFilters>;
  query: string;
}) {
  const [page, totalCount] = await Promise.all([
    listProducts({ ...filters, limit: DEFAULT_PAGE_SIZE }),
    countProducts(filters),
  ]);

  if (totalCount === 0) {
    return <NoResultsState query={query} />;
  }

  return (
    <>
      <h1 className="text-xl font-semibold sm:text-2xl">
        Results for &ldquo;{query}&rdquo;
      </h1>
      <p className="mt-1 mb-4 text-sm text-fg-muted">
        {totalCount.toLocaleString('en-IN')} {totalCount === 1 ? 'product' : 'products'}
      </p>

      <CatalogToolbar filters={filters} basePath="/search" totalCount={totalCount} />
      <ProductList initialPage={page} filters={filters} totalCount={totalCount} />
    </>
  );
}

function EmptyQueryState() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold sm:text-2xl">Search</h1>
      <p className="mb-6 text-sm text-fg-muted">
        Type in the box above, or browse a category.
      </p>
      <CategoryLinks />
    </>
  );
}

/**
 * No results.
 *
 * Offers a way out rather than a dead end. A bare "nothing found" leaves the shopper to guess
 * whether their spelling, the catalog, or the site is at fault.
 */
function NoResultsState({ query }: { query: string }) {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold sm:text-2xl">
        No results for &ldquo;{query}&rdquo;
      </h1>
      <p className="mb-4 text-sm text-fg-muted">Nothing in the catalog matches that.</p>

      <ul className="mb-6 list-disc space-y-1 pl-5 text-sm text-fg-muted">
        <li>Check the spelling.</li>
        <li>Try a shorter or more general term — &ldquo;shoes&rdquo; rather than a model name.</li>
        <li>Search by brand, or browse a category below.</li>
      </ul>

      <CategoryLinks />
    </>
  );
}

function CategoryLinks() {
  return (
    <nav aria-label="Browse categories">
      <h2 className="mb-2 text-sm font-semibold">Browse categories</h2>
      <ul className="flex flex-wrap gap-2">
        {CATEGORIES.map((category) => (
          <li key={category.slug}>
            <Link
              href={`/c/${category.slug}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm"
            >
              <span aria-hidden="true">{category.glyph}</span>
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
