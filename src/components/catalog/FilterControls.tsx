'use client';

import { Rating } from '@/components/ui/Rating';
import { cn } from '@/lib/cn';
import { PRICE_BANDS, type CatalogFilters } from '@/lib/catalog/query';
import type { CatalogFilterActions } from '@/hooks/useCatalogFilters';

/**
 * The filter fieldsets themselves, with no opinion about where they sit.
 *
 * Rendered twice: inside the mobile Sheet and in the desktop sidebar. Sharing one
 * component means the two can never offer different filters — a class of bug that is
 * easy to introduce and hard to notice.
 *
 * Toggles are `<button aria-pressed>` rather than checkboxes because each one *replaces*
 * a URL parameter rather than contributing to a form submission; `aria-pressed` conveys
 * that on/off state correctly to assistive tech.
 */
export function FilterControls({
  filters,
  actions,
}: {
  filters: CatalogFilters;
  actions: CatalogFilterActions;
}) {
  const { activeBand, setPriceBand, setMinRating, toggleInStock } = actions;

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Price</legend>
        <div className="flex flex-wrap gap-2">
          {PRICE_BANDS.map((band) => {
            const isActive = activeBand === band;
            return (
              <button
                key={band.label}
                type="button"
                aria-pressed={isActive}
                onClick={() => setPriceBand(isActive ? null : band)}
                className={cn(
                  'min-h-11 rounded-md border px-3 text-sm',
                  isActive
                    ? 'border-ink bg-ink text-fg-inverse'
                    : 'border-border bg-surface hover:bg-surface-sunken',
                )}
              >
                {band.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Customer rating</legend>
        <div className="flex flex-col gap-1">
          {[4, 3, 2].map((rating) => {
            const isActive = filters.minRating === rating;
            return (
              <button
                key={rating}
                type="button"
                aria-pressed={isActive}
                onClick={() => setMinRating(isActive ? undefined : rating)}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm',
                  isActive
                    ? 'border-ink bg-surface-sunken'
                    : 'border-transparent hover:bg-surface-sunken',
                )}
              >
                {/* Decorative here: the adjacent text carries the meaning. */}
                <Rating value={rating} count={1} size="sm" hideCount />
                <span>{rating} &amp; up</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Availability</legend>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={filters.inStock === true}
            onChange={toggleInStock}
            className="h-4 w-4 accent-ink"
          />
          In stock only
        </label>
      </fieldset>
    </div>
  );
}
