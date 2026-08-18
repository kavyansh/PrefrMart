import { db } from '@/lib/db';
import { getRatingDistribution, type RatingDistribution } from '@/lib/catalog/reviews';

/**
 * Read model for the product detail page.
 *
 * The JSON columns (`bullets`, `specs`, `imageKeys`) are parsed here so no component has to
 * know they are stored as text — a SQLite limitation that should not leak into the UI.
 */

export type ProductDetail = {
  id: string;
  slug: string;
  title: string;
  brand: string;
  description: string;
  bullets: string[];
  specs: Array<{ label: string; value: string }>;
  priceCents: number;
  listCents: number | null;
  currency: string;
  stock: number;
  images: string[];
  ratingAvg: number;
  ratingCount: number;
  category: { name: string; slug: string };
  distribution: RatingDistribution;
};

/** Parse a JSON text column, falling back rather than throwing on a malformed row. */
function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    // A bad row should degrade the page, not break it.
  }
  return [];
}

function parseSpecs(raw: string): Array<{ label: string; value: string }> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([label, value]) => ({ label, value }));
    }
  } catch {
    // As above.
  }
  return [];
}

export async function getProductDetail(slug: string): Promise<ProductDetail | null> {
  const row = await db.product.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      brand: true,
      description: true,
      bullets: true,
      specs: true,
      priceCents: true,
      listCents: true,
      currency: true,
      stock: true,
      imageKeys: true,
      ratingAvg: true,
      ratingCount: true,
      category: { select: { name: true, slug: true } },
    },
  });

  if (row === null) return null;

  // Only worth a second query when there is something to distribute.
  const distribution =
    row.ratingCount > 0
      ? await getRatingDistribution(row.id)
      : { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    brand: row.brand,
    description: row.description,
    bullets: parseJsonArray(row.bullets),
    specs: parseSpecs(row.specs),
    priceCents: row.priceCents,
    listCents: row.listCents,
    currency: row.currency,
    stock: row.stock,
    images: parseJsonArray(row.imageKeys),
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    category: row.category,
    distribution,
  };
}

/** Slugs of other products in the same category, for the "more like this" rail. */
export async function listRelatedProducts(product: {
  id: string;
  category: { slug: string };
}): Promise<
  Array<{
    id: string;
    slug: string;
    title: string;
    brand: string;
    priceCents: number;
    listCents: number | null;
    currency: string;
    ratingAvg: number;
    ratingCount: number;
    stock: number;
    image: string;
    categorySlug: string;
  }>
> {
  const rows = await db.product.findMany({
    where: {
      category: { slug: product.category.slug },
      id: { not: product.id },
      // Never recommend something that cannot be bought.
      stock: { gt: 0 },
    },
    orderBy: [{ ratingAvg: 'desc' }, { id: 'desc' }],
    take: 6,
    select: {
      id: true,
      slug: true,
      title: true,
      brand: true,
      priceCents: true,
      listCents: true,
      currency: true,
      ratingAvg: true,
      ratingCount: true,
      stock: true,
      imageKeys: true,
    },
  });

  return rows.map((row) => ({
    ...row,
    image: parseJsonArray(row.imageKeys)[0] ?? '',
    categorySlug: product.category.slug,
  }));
}
