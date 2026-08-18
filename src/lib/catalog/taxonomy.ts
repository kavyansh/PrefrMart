/**
 * The category taxonomy, shared by three consumers so they cannot drift:
 *  - prisma/seed.ts       (creates Category rows and assigns products)
 *  - scripts/gen-images.ts (colours the generated placeholder art)
 *  - the category navigation UI
 */

export type CategoryDef = {
  slug: string;
  name: string;
  glyph: string;
  /** [from, to] gradient for generated placeholder art. WCAG-safe against white text. */
  palette: readonly [string, string];
  /** Realistic price band in minor units, used by the seed. */
  priceRange: readonly [number, number];
};

export const CATEGORIES: readonly CategoryDef[] = [
  {
    slug: 'electronics',
    name: 'Electronics',
    glyph: '🎧',
    palette: ['#0f3d5c', '#1b6ca8'],
    priceRange: [79_900, 24_99_900],
  },
  {
    slug: 'home-kitchen',
    name: 'Home & Kitchen',
    glyph: '🍳',
    palette: ['#5c2e0f', '#a8631b'],
    priceRange: [19_900, 4_99_900],
  },
  {
    slug: 'fashion',
    name: 'Fashion',
    glyph: '👟',
    palette: ['#4a1042', '#8e2a7f'],
    priceRange: [29_900, 7_99_900],
  },
  {
    slug: 'books',
    name: 'Books',
    glyph: '📚',
    palette: ['#123d2b', '#22765a'],
    priceRange: [9_900, 1_49_900],
  },
  {
    slug: 'sports-fitness',
    name: 'Sports & Fitness',
    glyph: '🏋️',
    palette: ['#0d3b46', '#17798c'],
    priceRange: [24_900, 8_99_900],
  },
  {
    slug: 'beauty',
    name: 'Beauty',
    glyph: '🧴',
    palette: ['#5a1230', '#a82554'],
    priceRange: [14_900, 3_49_900],
  },
  {
    slug: 'toys-games',
    name: 'Toys & Games',
    glyph: '🧩',
    palette: ['#3d2a72', '#6b4fc4'],
    priceRange: [19_900, 2_99_900],
  },
  {
    slug: 'grocery',
    name: 'Grocery',
    glyph: '🛒',
    palette: ['#3f4a12', '#7a8c22'],
    priceRange: [4_900, 99_900],
  },
];

export const CATEGORY_BY_SLUG: ReadonlyMap<string, CategoryDef> = new Map(
  CATEGORIES.map((category) => [category.slug, category]),
);

/** Number of placeholder images generated per category. */
export const IMAGES_PER_CATEGORY = 6;

/** Image key format: `<categorySlug>-<index>`, resolving to /img/p/<key>.svg */
export function imageKey(categorySlug: string, index: number): string {
  return `${categorySlug}-${index}`;
}

export function imageSrc(key: string): string {
  return `/img/p/${key}.svg`;
}
