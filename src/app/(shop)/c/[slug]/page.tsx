import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { CatalogPage } from '@/components/catalog/CatalogPage';
import { parseFilters } from '@/lib/catalog/query';
import { CATEGORY_BY_SLUG } from '@/lib/catalog/taxonomy';

/** Dynamic for the same nonce-CSP reason as the home page. */
export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = CATEGORY_BY_SLUG.get(slug);

  if (!category) return { title: 'Category not found' };

  return {
    title: category.name,
    description: `Shop ${category.name.toLowerCase()} — browse the full range.`,
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  /*
   * Validated against the static taxonomy rather than the database: an unknown slug is a
   * 404, not an empty listing. "0 products" for a typo'd URL is worse for users and lies
   * to crawlers.
   *
   * This renders the not-found *body*; the 404 *status* is set in proxy.ts, because
   * `notFound()` cannot change the status of an already-streaming response. See the note
   * there.
   */
  const { slug } = await params;
  const category = CATEGORY_BY_SLUG.get(slug);
  if (!category) notFound();

  const filters = { ...parseFilters(toParams(await searchParams)), category: category.slug };

  return (
    <CatalogPage
      heading={category.name}
      filters={filters}
      basePath={`/c/${category.slug}`}
    />
  );
}

function toParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }
  return params;
}
