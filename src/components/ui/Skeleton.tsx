import { cn } from '@/lib/cn';

/**
 * Loading placeholder. Purely presentational and hidden from assistive tech — the
 * surrounding Suspense boundary is responsible for announcing loading state, so a
 * screen reader is not read a wall of meaningless boxes.
 *
 * The pulse is a Tailwind animation, which prefers-reduced-motion already zeroes
 * out via the base layer in globals.css.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('block animate-pulse rounded-md bg-border/60', className)}
    />
  );
}

/** Card-shaped skeleton matching the product card's geometry, to avoid layout shift. */
export function ProductCardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <Skeleton className="mb-3 aspect-square w-full" />
      <Skeleton className="mb-2 h-4 w-11/12" />
      <Skeleton className="mb-3 h-4 w-2/3" />
      <Skeleton className="mb-2 h-3 w-1/2" />
      <Skeleton className="h-5 w-1/3" />
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <ProductCardSkeleton key={index} />
      ))}
    </div>
  );
}
