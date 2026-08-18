'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { FilterControls } from '@/components/catalog/FilterControls';
import { useCatalogFilters } from '@/hooks/useCatalogFilters';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';
import { BROWSE_SORTS, SORT_LABELS, type CatalogFilters } from '@/lib/catalog/query';
import type { ProductSort } from '@/lib/catalog/sorts';

/**
 * Sort control, mobile filter trigger, and the chips showing what is currently applied.
 *
 * The chips matter more than they look: on mobile the filter panel is a sheet, so without
 * them there is no way to see what is filtering your results without reopening it.
 */
export function CatalogToolbar({
  filters,
  basePath,
  totalCount,
}: {
  filters: CatalogFilters;
  basePath: string;
  totalCount: number;
}) {
  const actions = useCatalogFilters({ filters, basePath });
  const [sheetOpen, setSheetOpen] = useState(false);

  const { isPending, activeCount, setSort, setPriceBand, setMinRating, toggleInStock, clearAll } =
    actions;

  return (
    <>
      <div
        className={cn(
          'mb-3 flex items-center gap-2',
          // Dim rather than replace: the user keeps reading the old results while the
          // new ones load.
          isPending && 'opacity-60 transition-opacity',
        )}
      >
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setSheetOpen(true)}
          className="lg:hidden"
          aria-haspopup="dialog"
        >
          <FilterIcon />
          Filters
          {activeCount > 0 && (
            <Badge tone="info" className="ml-0.5">
              {activeCount}
            </Badge>
          )}
        </Button>

        <div className="flex-1" />

        <label className="flex items-center gap-2 text-sm">
          <span className="text-fg-muted">Sort</span>
          <select
            value={filters.sort ?? 'newest'}
            onChange={(event) => setSort(event.target.value as ProductSort)}
            className="min-h-11 rounded-md border border-border bg-surface px-2 text-sm"
          >
            {BROWSE_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {activeCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(filters.minPrice !== undefined || filters.maxPrice !== undefined) && (
            <FilterChip
              label={priceLabel(filters.minPrice, filters.maxPrice)}
              onRemove={() => setPriceBand(null)}
            />
          )}
          {filters.minRating !== undefined && (
            <FilterChip
              label={`${filters.minRating} stars & up`}
              onRemove={() => setMinRating(undefined)}
            />
          )}
          {filters.inStock && <FilterChip label="In stock" onRemove={toggleInStock} />}

          <button
            type="button"
            onClick={clearAll}
            className="min-h-11 px-2 text-sm text-info underline"
          >
            Clear all
          </button>
        </div>
      )}

      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Filters"
        description={`${totalCount.toLocaleString('en-IN')} products match`}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={clearAll}>
              Clear all
            </Button>
            <Button fullWidth onClick={() => setSheetOpen(false)}>
              Show results
            </Button>
          </div>
        }
      >
        <FilterControls filters={filters} actions={actions} />
      </Sheet>

      <span aria-live="polite" className="sr-only">
        {isPending ? 'Updating results' : ''}
      </span>
    </>
  );
}

function priceLabel(min: number | undefined, max: number | undefined): string {
  if (min !== undefined && max !== undefined) {
    return `${formatMoney(min)} – ${formatMoney(max)}`;
  }
  if (max !== undefined) return `Under ${formatMoney(max)}`;
  if (min !== undefined) return `Over ${formatMoney(min)}`;
  return 'Any price';
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface py-1 pr-1 pl-3 text-sm">
      {label}
      <button
        type="button"
        onClick={onRemove}
        // Names the specific filter, so a screen reader hears "Remove filter In stock"
        // rather than several identical "Remove" buttons.
        aria-label={`Remove filter ${label}`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-fg-muted hover:bg-surface-sunken"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </button>
    </span>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M3 6h18M6 12h12M10 18h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
