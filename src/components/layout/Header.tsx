import Link from 'next/link';
import { listCategories } from '@/lib/catalog/products';

/**
 * Site header. Server Component — the search field and cart badge become client
 * islands in later phases, but the shell itself stays JS-free.
 */
export async function Header() {
  const categories = await listCategories();

  return (
    <header className="sticky top-0 z-40 bg-ink text-fg-inverse">
      <div className="mx-auto flex h-(--spacing-header) max-w-(--container-page) items-center gap-3 px-3 sm:px-4">
        <Link href="/" className="shrink-0 text-lg font-semibold tracking-tight">
          Tender
        </Link>

        {/* Search lands here in Phase 6. */}
        <div className="flex-1" />

        <nav aria-label="Account and cart" className="flex items-center gap-1">
          <Link
            href="/account/profile"
            className="rounded-md px-3 py-2 text-sm hover:bg-ink-soft"
          >
            Account
          </Link>
          <Link href="/cart" className="rounded-md px-3 py-2 text-sm hover:bg-ink-soft">
            Cart
          </Link>
        </nav>
      </div>

      {/* Category rail. Scrolls horizontally on phones rather than wrapping. */}
      <nav
        aria-label="Product categories"
        className="border-t border-white/10 bg-ink-soft"
      >
        <ul className="mx-auto flex max-w-(--container-page) gap-1 overflow-x-auto px-2 py-1.5 sm:px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <li className="shrink-0">
            <Link
              href="/"
              className="inline-flex min-h-9 items-center rounded-md px-3 text-sm whitespace-nowrap hover:bg-white/10"
            >
              All
            </Link>
          </li>
          {categories.map((category) => (
            <li key={category.slug} className="shrink-0">
              <Link
                href={`/c/${category.slug}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap hover:bg-white/10"
              >
                <span aria-hidden="true">{category.glyph}</span>
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
