import type { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { clampLimit, decodeCursor, keysetArgs, toPage, type Page } from '@/lib/pagination';
import type { ProductListQuery, ProductSort } from '@/lib/validation/schemas';

/**
 * Read model for the catalog.
 *
 * The DTO below is what crosses to the client: a flat, serializable shape with the
 * JSON columns already parsed and only the first image resolved. Prisma rows are
 * never handed to components directly — that would leak columns and make the client
 * payload grow every time the schema does.
 */

export type ProductListItem = {
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
  /** First image key; resolve with `imageSrc()`. */
  image: string;
  categorySlug: string;
};

/** Columns needed for a card. Selecting explicitly keeps description out of list payloads. */
const LIST_SELECT = {
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
  category: { select: { slug: true } },
} satisfies Prisma.ProductSelect;

type ListRow = Prisma.ProductGetPayload<{ select: typeof LIST_SELECT }>;

function firstImageKey(imageKeys: string): string {
  try {
    const parsed = JSON.parse(imageKeys) as unknown;
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0];
  } catch {
    // Fall through: a malformed row should render a placeholder, not crash the page.
  }
  return '';
}

function toListItem(row: ListRow): ProductListItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    brand: row.brand,
    priceCents: row.priceCents,
    listCents: row.listCents,
    currency: row.currency,
    ratingAvg: row.ratingAvg,
    ratingCount: row.ratingCount,
    stock: row.stock,
    image: firstImageKey(row.imageKeys),
    categorySlug: row.category.slug,
  };
}

/**
 * Sort definitions. Every one ends in `id` — that tiebreaker is what makes the sort
 * a total order, which is what makes cursor pagination correct. Without it, rows
 * sharing a price or rating can repeat across pages or vanish between them.
 */
const ORDER_BY: Record<ProductSort, Prisma.ProductOrderByWithRelationInput[]> = {
  // No text relevance scoring in SQLite without FTS; newest is the honest fallback.
  relevance: [{ createdAt: 'desc' }, { id: 'desc' }],
  newest: [{ createdAt: 'desc' }, { id: 'desc' }],
  'price-asc': [{ priceCents: 'asc' }, { id: 'asc' }],
  'price-desc': [{ priceCents: 'desc' }, { id: 'desc' }],
  rating: [{ ratingAvg: 'desc' }, { id: 'desc' }],
};

function buildWhere(query: ProductListQuery): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};

  if (query.category) {
    where.category = { slug: query.category };
  }

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.priceCents = {
      ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
    };
  }

  if (query.minRating !== undefined) {
    where.ratingAvg = { gte: query.minRating };
  }

  if (query.inStock) {
    where.stock = { gt: 0 };
  }

  if (query.q) {
    // `searchText` is a pre-lowercased blob built by the seed. SQLite's LIKE is
    // case-insensitive for ASCII, which is all we need here; Phase 6 layers the
    // real search UI on top of this same predicate.
    where.searchText = { contains: query.q.toLowerCase() };
  }

  return where;
}

export async function listProducts(query: ProductListQuery): Promise<Page<ProductListItem>> {
  const limit = clampLimit(query.limit);
  const sort: ProductSort = query.sort ?? (query.q ? 'relevance' : 'newest');
  const where = buildWhere(query);
  const orderBy = ORDER_BY[sort];

  // decodeCursor returns null for anything that is not a plausible record id, so a
  // tampered cursor degrades to "page one" rather than reaching the query layer.
  const cursor = decodeCursor(query.cursor);

  async function fetchPage(from: string | null) {
    return db.product.findMany({
      where,
      orderBy,
      select: LIST_SELECT,
      ...keysetArgs(from, limit),
    });
  }

  let rows: ListRow[];
  try {
    rows = await fetchPage(cursor);
  } catch (error) {
    // A cursor can outlive the row it points at (deleted product, reseeded database).
    // Prisma throws in that case; restarting from page one beats a 500 for someone
    // returning to a stale tab.
    if (cursor === null) throw error;
    console.warn('[catalog] stale cursor, restarting from first page');
    rows = await fetchPage(null);
  }

  const page = toPage(rows, limit);
  return { items: page.items.map(toListItem), nextCursor: page.nextCursor };
}

export async function listCategories() {
  return db.category.findMany({
    orderBy: { sortRank: 'asc' },
    select: { id: true, name: true, slug: true, glyph: true },
  });
}

export async function countProducts(query: ProductListQuery): Promise<number> {
  return db.product.count({ where: buildWhere(query) });
}
