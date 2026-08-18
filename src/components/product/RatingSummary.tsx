import { Rating } from '@/components/ui/Rating';
import type { RatingDistribution } from '@/lib/catalog/reviews';

/**
 * Average rating, total rater count, and the per-star distribution — requirement 4.1.
 *
 * A Server Component: bars are plain divs sized by percentage, so this costs no client JS.
 *
 * Accessibility: the bars are decorative, and each row's real content is a text link-free
 * label ("5 stars, 312 reviews, 44%"). Presenting the histogram as a table would be
 * technically defensible but reads badly aloud; a list of labelled rows does not.
 */

const STARS = [5, 4, 3, 2, 1] as const;
const numberFormat = new Intl.NumberFormat('en-IN');

export function RatingSummary({
  ratingAvg,
  ratingCount,
  distribution,
}: {
  ratingAvg: number;
  ratingCount: number;
  distribution: RatingDistribution;
}) {
  if (ratingCount === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm text-fg-muted">
          No ratings yet. Be the first to review this product.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="text-3xl font-semibold">{ratingAvg.toFixed(1)}</span>
        <div>
          <Rating value={ratingAvg} count={ratingCount} hideCount />
          <p className="mt-0.5 text-sm text-fg-muted">
            {numberFormat.format(ratingCount)} {ratingCount === 1 ? 'rating' : 'ratings'}
          </p>
        </div>
      </div>

      <ul className="space-y-1.5">
        {STARS.map((star) => {
          const count = distribution[star];
          // Guard the divide: ratingCount is non-zero here, but the histogram is derived
          // from a separate query and could in principle disagree.
          const percent = ratingCount > 0 ? Math.round((count / ratingCount) * 100) : 0;

          return (
            <li key={star} className="flex items-center gap-2 text-sm">
              <span className="w-12 shrink-0 text-fg-muted">{star} star</span>

              <span
                aria-hidden="true"
                className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-sunken"
              >
                <span
                  className="block h-full rounded-full bg-star"
                  style={{ width: `${percent}%` }}
                />
              </span>

              <span className="w-9 shrink-0 text-right text-fg-muted tabular-nums">
                {percent}%
              </span>

              <span className="sr-only">
                {numberFormat.format(count)} {count === 1 ? 'review' : 'reviews'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
