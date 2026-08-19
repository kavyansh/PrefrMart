import Link from 'next/link';
import { CartBadge } from '@/components/cart/CartBadge';
import { SearchBox } from '@/components/search/SearchBox';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { listCategories } from '@/lib/catalog/products';

/**
 * Site header. Server Component — the search field and cart badge become client islands in
 * later phases, but the shell itself stays JS-free.
 *
 * Reading the session here is what makes the account link honest: it points to settings when
 * signed in and to sign-in when not, rather than sending signed-out visitors to a guarded route
 * only to bounce them through a redirect.
 */
export async function Header() {
  const [categories, user] = await Promise.all([listCategories(), getCurrentUser()]);

  return (
    <header className="sticky top-0 z-40 bg-ink text-fg-inverse">
      <div className="mx-auto flex h-(--spacing-header) max-w-(--container-page) items-center gap-3 px-3 sm:px-4">
        <Link href="/" className="shrink-0 text-lg font-semibold tracking-tight">
          PrefrMart
        </Link>

        {/*
          Search sits between the wordmark and the account links, and takes the remaining width.
          On a phone that is most of the bar, which is the right priority for a storefront.
        */}
        <div className="min-w-0 flex-1">
          <SearchBox />
        </div>

        <nav aria-label="Account and cart" className="flex items-center gap-1">
          {user === null ? (
            <Link href="/login" className="rounded-md px-3 py-2 text-sm hover:bg-ink-soft">
              Sign in
            </Link>
          ) : (
            <Link
              href="/account/profile"
              className="rounded-md px-3 py-2 text-sm hover:bg-ink-soft"
            >
              {/* First name only: the header is tight on a phone. */}
              <span className="sr-only">Your account, </span>
              {user.name.split(' ')[0]}
            </Link>
          )}
          <CartBadge />
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
