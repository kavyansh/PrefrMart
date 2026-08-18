import { ProductGridSkeleton } from '@/components/ui/Skeleton';

/**
 * Shown while the home route's server render is in flight. Mirrors the real layout's
 * geometry so the transition into content does not shift anything.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-(--container-page) px-3 py-4 sm:px-4">
      <div className="h-7 w-56 animate-pulse rounded-md bg-border/60" aria-hidden="true" />
      <div className="mt-4 lg:flex lg:gap-8">
        <div aria-hidden="true" className="hidden lg:block lg:w-56 lg:shrink-0" />
        <div className="min-w-0 flex-1">
          <ProductGridSkeleton count={12} />
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        Loading products
      </p>
    </main>
  );
}
