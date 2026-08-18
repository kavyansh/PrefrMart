import { Suspense } from 'react';
import { CatalogFilterSidebar } from '@/components/catalog/CatalogFilterSidebar';
import { CatalogToolbar } from '@/components/catalog/CatalogToolbar';
import { ProductList } from '@/components/product/ProductList';
import { ProductGridSkeleton } from '@/components/ui/Skeleton';
import { countProducts, listProducts } from '@/lib/catalog/products';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { filtersKey, type CatalogFilters } from '@/lib/catalog/query';

/**
 * Shared listing layout for the home page and every category page.
 *
 * A Server Component: the heading, filter rail and first page of results are all HTML on
 * arrival. Only the toolbar, sidebar controls and the infinite-scroll list are client
 * islands, which is what keeps the route-specific JS small.
 *
 * The results block is wrapped in Suspense so the shell paints immediately and the grid
 * streams in behind it, rather than the whole page waiting on the query.
 */
export function CatalogPage({
  heading,
  filters,
  basePath,
  intro,
}: {
  heading: string;
  filters: CatalogFilters;
  /** Route the filter controls navigate within. */
  basePath: string;
  intro?: string;
}) {
  return (
    <main id="main" className="mx-auto max-w-(--container-page) px-3 py-4 sm:px-4">
      <h1 className="text-xl font-semibold sm:text-2xl">{heading}</h1>
      {intro !== undefined && <p className="mt-1 text-sm text-fg-muted">{intro}</p>}

      <div className="mt-4 lg:flex lg:gap-8">
        <Suspense fallback={<SidebarSkeleton />}>
          <FilterRail filters={filters} basePath={basePath} />
        </Suspense>

        <div className="min-w-0 flex-1">
          {/*
            `key` forces a fresh mount when the filter set changes. Without it, the list
            would keep the previous filters' accumulated items in state while the server
            hands it a new first page — showing a mix of both.
          */}
          <Suspense key={filtersKey(filters)} fallback={<ProductGridSkeleton count={12} />}>
            <Results filters={filters} basePath={basePath} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

/** Sidebar needs the count-independent controls only, so it renders without awaiting. */
function FilterRail({ filters, basePath }: { filters: CatalogFilters; basePath: string }) {
  return <CatalogFilterSidebar filters={filters} basePath={basePath} />;
}

async function Results({ filters, basePath }: { filters: CatalogFilters; basePath: string }) {
  // One round trip for both: the page of rows and the total for "showing N of M".
  const [page, totalCount] = await Promise.all([
    listProducts({ ...filters, limit: DEFAULT_PAGE_SIZE }),
    countProducts(filters),
  ]);

  return (
    <>
      <CatalogToolbar filters={filters} basePath={basePath} totalCount={totalCount} />
      <ProductList initialPage={page} filters={filters} totalCount={totalCount} />
    </>
  );
}

function SidebarSkeleton() {
  return <div aria-hidden="true" className="hidden lg:block lg:w-56 lg:shrink-0" />;
}
