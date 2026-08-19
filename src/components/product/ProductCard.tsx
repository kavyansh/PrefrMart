import Image from 'next/image';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Price } from '@/components/ui/Price';
import { Rating } from '@/components/ui/Rating';
import { imageSrc } from '@/lib/catalog/taxonomy';
import type { ProductListItem } from '@/lib/catalog/products';
import { cn } from '@/lib/cn';

/**
 * Product card. A Server Component with no interactivity of its own, so a grid of
 * 24 of them costs zero client JS.
 *
 * The whole card is one link. Nested interactive controls (a wishlist button, say)
 * would need to live outside the anchor — nesting them inside is invalid HTML and
 * breaks keyboard navigation.
 */
export function ProductCard({
  product,
  priority = false,
}: {
  product: ProductListItem;
  /** Set on the first few cards only — the LCP candidate should not be lazy-loaded. */
  priority?: boolean;
}) {
  const outOfStock = product.stock === 0;
  const lowStock = !outOfStock && product.stock <= 5;

  return (
    <article
      // Read by ProductList to measure one card's height, which is what the row virtualizer
      // estimates row size from.
      data-card=""
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface',
        'transition-shadow duration-(--duration-base) hover:shadow-md',
        /*
         * Containment for everything below the first row. `content-visibility: auto` never
         * skips on-screen content, so applying it here would be harmless — but it has
         * documented interactions with LCP element detection, and the LCP candidate is one of
         * the `priority` cards. Excluding them removes the question entirely.
         */
        !priority && 'offscreen-skip',
      )}
    >
      <Link
        href={`/p/${product.slug}`}
        // Stretched link: the anchor covers the card, so the tap target is the whole
        // tile while the accessible name stays just the product title.
        className="absolute inset-0 z-10"
      >
        <span className="sr-only">{product.title}</span>
      </Link>

      <div className="relative aspect-square overflow-hidden bg-surface-sunken">
        {product.image ? (
          <Image
            src={imageSrc(product.image)}
            alt=""
            fill
            // Two columns on phones, up to five on wide screens — tell the browser
            // so it never downloads a 800px image for a 180px slot.
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            priority={priority}
            className={cn(
              'object-cover transition-transform duration-(--duration-base)',
              'group-hover:scale-[1.03]',
              outOfStock && 'opacity-55',
            )}
          />
        ) : (
          <div aria-hidden="true" className="h-full w-full bg-surface-sunken" />
        )}

        {outOfStock && (
          <div className="absolute inset-x-0 bottom-0 bg-ink/80 px-2 py-1 text-center text-xs font-medium text-fg-inverse">
            Out of stock
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="text-xs text-fg-subtle">{product.brand}</p>

        <h3 className="line-clamp-2 text-sm leading-snug font-medium text-fg">{product.title}</h3>

        <Rating value={product.ratingAvg} count={product.ratingCount} size="sm" />

        <div className="mt-auto pt-1">
          <Price
            priceCents={product.priceCents}
            listCents={product.listCents}
            currency={product.currency}
          />
          {lowStock && (
            <Badge tone="warning" className="mt-1.5">
              Only {product.stock} left
            </Badge>
          )}
        </div>
      </div>
    </article>
  );
}
