'use client';

import { FilterControls } from '@/components/catalog/FilterControls';
import { useCatalogFilters } from '@/hooks/useCatalogFilters';
import type { CatalogFilters } from '@/lib/catalog/query';

/**
 * Persistent desktop filter rail. Hidden below `lg`, where the same controls appear in
 * the toolbar's Sheet instead.
 */
export function CatalogFilterSidebar({
  filters,
  basePath,
}: {
  filters: CatalogFilters;
  basePath: string;
}) {
  const actions = useCatalogFilters({ filters, basePath });

  return (
    <aside
      aria-labelledby="filter-heading"
      className="hidden lg:block lg:w-56 lg:shrink-0"
    >
      <h2 id="filter-heading" className="mb-3 text-sm font-semibold">
        Refine
      </h2>
      <FilterControls filters={filters} actions={actions} />
    </aside>
  );
}
