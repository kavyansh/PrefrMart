import { db } from '@/lib/db';
import { CATEGORIES } from '@/lib/catalog/taxonomy';

/**
 * Typeahead suggestions.
 *
 * Deliberately not a second search implementation. Full results come from the existing
 * `listProducts({ q })` path, so the suggestions a shopper sees and the results they land on are
 * driven by the same `searchText` predicate. A separate matcher here would let the two disagree —
 * suggesting something that then returns nothing.
 *
 * Three kinds of suggestion, in priority order: matching categories (fewest, most useful — they
 * narrow the whole catalog), then brands, then individual products.
 */

export type Suggestion =
  | { kind: 'category'; label: string; href: string }
  | { kind: 'brand'; label: string; href: string }
  | { kind: 'product'; label: string; href: string };

const MAX_PRODUCTS = 6;
const MAX_BRANDS = 3;

export async function getSuggestions(rawQuery: string): Promise<Suggestion[]> {
  const query = rawQuery.trim().toLowerCase();
  // Below two characters almost everything matches, which is noise rather than help.
  if (query.length < 2) return [];

  const suggestions: Suggestion[] = [];

  // Categories come from the static taxonomy — no query needed.
  for (const category of CATEGORIES) {
    if (category.name.toLowerCase().includes(query)) {
      suggestions.push({
        kind: 'category',
        label: category.name,
        href: `/c/${category.slug}`,
      });
    }
  }

  const [brands, products] = await Promise.all([
    db.product.findMany({
      // `mode: 'insensitive'` is load-bearing on Postgres, whose LIKE is case-sensitive — unlike
      // SQLite's, which this originally relied on. Without it a lowercased query never matches a
      // capitalised brand and the brand suggestions silently vanish. `searchText` below needs no
      // such treatment: the seed stores it pre-lowercased.
      where: { brand: { contains: query, mode: 'insensitive' } },
      // distinct is what stops one brand appearing once per product it sells.
      distinct: ['brand'],
      select: { brand: true },
      take: MAX_BRANDS,
      orderBy: { brand: 'asc' },
    }),
    db.product.findMany({
      // Same predicate the results page uses.
      where: { searchText: { contains: query } },
      select: { title: true, slug: true },
      // Best-rated first: a suggestion list is a recommendation, not a data dump.
      orderBy: [{ ratingAvg: 'desc' }, { id: 'desc' }],
      take: MAX_PRODUCTS,
    }),
  ]);

  for (const { brand } of brands) {
    suggestions.push({
      kind: 'brand',
      label: brand,
      href: `/search?q=${encodeURIComponent(brand)}`,
    });
  }

  for (const product of products) {
    suggestions.push({
      kind: 'product',
      label: product.title,
      href: `/p/${product.slug}`,
    });
  }

  return suggestions;
}
