import { cn } from '@/lib/cn';

/**
 * Star rating display. Satisfies requirement 4.1: the score and how many people
 * rated it, side by side.
 *
 * Rendered as inline SVG rather than an icon font or a component library, so a
 * product card costs zero client JS to show its rating.
 *
 * Accessibility: the stars are decorative (aria-hidden) and the real information
 * is a single text label, so a screen reader announces "4.3 out of 5, 1,240
 * ratings" instead of five separate star images.
 */

const STAR_PATH =
  'M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.35l-5.8 3.05 1.1-6.45-4.7-4.6 6.5-.95z';

type RatingSize = 'sm' | 'md' | 'lg';

const SIZES: Record<RatingSize, { star: string; text: string }> = {
  sm: { star: 'h-3.5 w-3.5', text: 'text-xs' },
  md: { star: 'h-4 w-4', text: 'text-sm' },
  lg: { star: 'h-5 w-5', text: 'text-base' },
};

const countFormatter = new Intl.NumberFormat('en-IN');

export type RatingProps = {
  /** Average rating, 0-5. */
  value: number;
  /** How many people rated it. */
  count: number;
  size?: RatingSize;
  /** Hide the numeric count (used where space is very tight). */
  hideCount?: boolean;
  className?: string;
};

export function Rating({ value, count, size = 'md', hideCount = false, className }: RatingProps) {
  const sizing = SIZES[size];

  if (count === 0) {
    return (
      <span className={cn('text-fg-subtle', sizing.text, className)}>No ratings yet</span>
    );
  }

  const clamped = Math.max(0, Math.min(5, value));
  // Width of the filled overlay, as a percentage of the five-star track. This is
  // what allows a true partial star (4.3) rather than rounding to the nearest half.
  const fillPercent = (clamped / 5) * 100;

  const label = `${clamped.toFixed(1)} out of 5, ${countFormatter.format(count)} ${
    count === 1 ? 'rating' : 'ratings'
  }`;

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className="relative inline-flex shrink-0"
        role="img"
        aria-label={hideCount ? label : undefined}
        aria-hidden={hideCount ? undefined : true}
      >
        {/* Empty track */}
        <span className="inline-flex">
          {[0, 1, 2, 3, 4].map((index) => (
            <Star key={index} className={cn(sizing.star, 'text-star-empty')} />
          ))}
        </span>
        {/* Filled overlay, clipped to the score */}
        <span
          className="absolute inset-y-0 left-0 inline-flex overflow-hidden"
          style={{ width: `${fillPercent}%` }}
        >
          {[0, 1, 2, 3, 4].map((index) => (
            <Star key={index} className={cn(sizing.star, 'shrink-0 text-star')} />
          ))}
        </span>
      </span>

      {!hideCount && (
        <span className={cn('text-fg-muted', sizing.text)}>
          <span className="font-medium text-fg">{clamped.toFixed(1)}</span>
          {/* The count is the "how many people rated it" figure. */}
          <span className="ml-1">({countFormatter.format(count)})</span>
          <span className="sr-only"> {label}</span>
        </span>
      )}
    </span>
  );
}

function Star({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d={STAR_PATH} />
    </svg>
  );
}
