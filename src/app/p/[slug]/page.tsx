import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AddToCartButton } from '@/components/cart/AddToCartButton';
import { Header } from '@/components/layout/Header';
import { ProductCard } from '@/components/product/ProductCard';
import { ProductGallery } from '@/components/product/ProductGallery';
import { RatingSummary } from '@/components/product/RatingSummary';
import { ReviewForm } from '@/components/review/ReviewForm';
import { ReviewList } from '@/components/review/ReviewList';
import { Badge } from '@/components/ui/Badge';
import { Price } from '@/components/ui/Price';
import { Rating } from '@/components/ui/Rating';
import { JsonLd } from '@/components/seo/JsonLd';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getProductDetail, listRelatedProducts } from '@/lib/catalog/productDetail';
import { listReviews } from '@/lib/catalog/reviews';
import { db } from '@/lib/db';

/** Dynamic for the nonce-CSP reason documented in proxy.ts. */
export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductDetail(slug);

  if (product === null) return { title: 'Product not found' };

  return {
    title: product.title,
    // Trimmed: search engines truncate well before this, and the full description is on
    // the page anyway.
    description: product.description.slice(0, 160),
    openGraph: {
      title: product.title,
      description: product.description.slice(0, 200),
      images: product.images.length > 0 ? [`/img/p/${product.images[0]}.svg`] : [],
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;

  const product = await getProductDetail(slug);
  if (product === null) notFound();

  // Independent queries, so run them together rather than in series.
  const [user, reviewPage, related] = await Promise.all([
    getCurrentUser(),
    listReviews({ productId: product.id, limit: 8 }),
    listRelatedProducts(product),
  ]);

  // Whether this user already has a review decides between the form and a note. Cheap:
  // it hits the (productId, userId) unique index.
  const ownReview =
    user === null
      ? null
      : await db.review.findUnique({
          where: { productId_userId: { productId: product.id, userId: user.id } },
          select: { id: true },
        });

  const outOfStock = product.stock === 0;

  return (
    <>
      <Header />

      {/* Product structured data. See components/seo/JsonLd for why this is safe. */}
      <JsonLd data={buildProductJsonLd(product)} />

      <main id="main" className="mx-auto max-w-(--container-page) px-3 py-4 sm:px-4">
        <nav aria-label="Breadcrumb" className="mb-3 text-sm text-fg-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:underline">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href={`/c/${product.category.slug}`} className="hover:underline">
                {product.category.name}
              </Link>
            </li>
          </ol>
        </nav>

        <div className="lg:flex lg:gap-8">
          <div className="lg:w-1/2 lg:shrink-0">
            <ProductGallery images={product.images} title={product.title} />
          </div>

          <div className="mt-4 lg:mt-0 lg:flex-1">
            <p className="text-sm text-fg-muted">{product.brand}</p>
            <h1 className="mt-0.5 text-xl font-semibold sm:text-2xl">{product.title}</h1>

            <div className="mt-2">
              {/* Anchors to the reviews section, the way retail pages do. */}
              <a href="#reviews" className="inline-flex items-center gap-2 hover:underline">
                <Rating value={product.ratingAvg} count={product.ratingCount} />
              </a>
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <Price
                priceCents={product.priceCents}
                listCents={product.listCents}
                currency={product.currency}
                size="xl"
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {outOfStock ? (
                  <Badge tone="danger">Out of stock</Badge>
                ) : product.stock <= 5 ? (
                  <Badge tone="warning">Only {product.stock} left</Badge>
                ) : (
                  <Badge tone="success">In stock</Badge>
                )}

                {!outOfStock && (
                  <span className="text-sm text-fg-muted">
                    Delivery in {product.stock > 50 ? '2-3' : '3-5'} days
                  </span>
                )}
              </div>

              <div className="mt-4">
                <AddToCartButton
                  productId={product.id}
                  stock={product.stock}
                  productTitle={product.title}
                />
              </div>
            </div>

            {product.bullets.length > 0 && (
              <section className="mt-6">
                <h2 className="mb-2 text-base font-semibold">Highlights</h2>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {product.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-6">
              <h2 className="mb-2 text-base font-semibold">About this item</h2>
              <p className="text-sm text-fg">{product.description}</p>
            </section>

            {product.specs.length > 0 && (
              <section className="mt-6">
                <h2 className="mb-2 text-base font-semibold">Specifications</h2>
                {/* A real table: this is tabular label/value data. */}
                <table className="w-full text-sm">
                  <tbody>
                    {product.specs.map((spec) => (
                      <tr key={spec.label} className="border-b border-border last:border-0">
                        <th scope="row" className="py-2 pr-4 text-left font-medium text-fg-muted">
                          {spec.label}
                        </th>
                        <td className="py-2">{spec.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        </div>

        <section id="reviews" className="mt-10 scroll-mt-20">
          <h2 className="mb-4 text-lg font-semibold">Ratings and reviews</h2>

          <div className="lg:flex lg:gap-8">
            <div className="lg:w-72 lg:shrink-0">
              <RatingSummary
                ratingAvg={product.ratingAvg}
                ratingCount={product.ratingCount}
                distribution={product.distribution}
              />

              <div className="mt-4">
                {user === null ? (
                  <p className="rounded-lg border border-border bg-surface p-4 text-sm text-fg-muted">
                    <Link href="/login" className="text-info underline">
                      Sign in
                    </Link>{' '}
                    to write a review.
                  </p>
                ) : ownReview !== null ? (
                  <p className="rounded-lg border border-border bg-surface p-4 text-sm text-fg-muted">
                    You have already reviewed this product.
                  </p>
                ) : (
                  <ReviewForm productSlug={product.slug} />
                )}
              </div>
            </div>

            <div className="mt-6 min-w-0 flex-1 lg:mt-0">
              <ReviewList
                productSlug={product.slug}
                initialPage={reviewPage}
                totalCount={product.ratingCount}
              />
            </div>
          </div>
        </section>

        {related.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-lg font-semibold">More in {product.category.name}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}

/** schema.org Product descriptor. Serialisation and escaping happen in `JsonLd`. */
function buildProductJsonLd(product: {
  title: string;
  description: string;
  brand: string;
  slug: string;
  priceCents: number;
  currency: string;
  stock: number;
  ratingAvg: number;
  ratingCount: number;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description,
    brand: { '@type': 'Brand', name: product.brand },
    offers: {
      '@type': 'Offer',
      price: (product.priceCents / 100).toFixed(2),
      priceCurrency: product.currency,
      availability:
        product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
    ...(product.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.ratingAvg,
            reviewCount: product.ratingCount,
          },
        }
      : {}),
  };
}
