import Link from 'next/link';
import { CATEGORIES } from '@/lib/catalog/taxonomy';

/**
 * Segment-level not-found for unknown category slugs. Offers the real categories rather
 * than a dead end, since a wrong slug usually means a typo or a stale link.
 */
export default function CategoryNotFound() {
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-2 text-xl font-semibold">Category not found</h1>
      <p className="mb-6 text-sm text-fg-muted">
        That category does not exist. Try one of these instead:
      </p>
      <ul className="flex flex-wrap justify-center gap-2">
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
    </main>
  );
}
