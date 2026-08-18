/**
 * Seeds a complete, reproducible demo catalog.
 *
 * Everything derives from CATALOG_SEED, so two runs produce byte-identical data —
 * which means a bug found on one machine reproduces on another, and the generated
 * placeholder art always matches the products that reference it.
 *
 * Run with `npm run db:seed` (or `npm run db:reset` to rebuild from scratch).
 */

process.loadEnvFile('.env');

import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { CATEGORIES, IMAGES_PER_CATEGORY, imageKey } from '../src/lib/catalog/taxonomy.ts';
import { hashPassword } from '../src/lib/auth/password.ts';
import { computeTotals, type DeliveryOption } from '../src/lib/money.ts';
import { CATALOG_SEED, createRng, type Rng } from '../src/lib/rng.ts';
import {
  DESCRIPTION_CLOSERS,
  DESCRIPTION_OPENERS,
  FIRST_NAMES,
  LAST_NAMES,
  REVIEW_BODIES,
  REVIEW_TITLES,
  VOCABULARY,
} from './catalog-vocabulary.ts';

const PRODUCTS_PER_CATEGORY = 63; // 8 categories -> 504 products
const REVIEWS_TARGET = 3_000;
const ORDERS_TO_CREATE = 6;

/**
 * Extra accounts that exist only to author reviews. Review volume is bounded by
 * the (productId, userId) unique constraint, so hitting REVIEWS_TARGET across 504
 * products needs a pool this size — and it makes the rater counts look real.
 */
const REVIEWER_POOL_SIZE = 60;

const DEMO_PASSWORD = 'demo1234';

const DEMO_USERS = [
  { email: 'asha@example.com', name: 'Asha Menon' },
  { email: 'ravi@example.com', name: 'Ravi Iyer' },
  { email: 'meera@example.com', name: 'Meera Nair' },
  { email: 'dan@example.com', name: 'Dan Whitfield' },
  { email: 'sofia@example.com', name: 'Sofia Almeida' },
] as const;

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

/** Prices land on retail-looking endings (…99, …49) rather than round numbers. */
function retailPrice(rng: Rng, [min, max]: readonly [number, number]): number {
  const raw = rng.int(min, max);
  const rupees = Math.max(1, Math.round(raw / 100));
  const ending = rng.pick([99, 99, 99, 49, 95] as const);
  const base = Math.max(1, Math.floor(rupees / 100) * 100);
  return base * 100 + ending * 100 - 100;
}

function daysAgo(days: number, rng: Rng): Date {
  const base = Date.UTC(2026, 7, 18); // fixed "now" so seeded dates stay deterministic
  const jitterMs = rng.int(0, 23 * 60 * 60 * 1000);
  return new Date(base - days * 24 * 60 * 60 * 1000 - jitterMs);
}

/** Skews toward 4-5 stars the way real retail distributions do. */
function skewedRating(rng: Rng): number {
  const roll = rng.next();
  if (roll < 0.46) return 5;
  if (roll < 0.74) return 4;
  if (roll < 0.87) return 3;
  if (roll < 0.95) return 2;
  return 1;
}

function ratingBand(rating: number): 'high' | 'mid' | 'low' {
  if (rating >= 4) return 'high';
  if (rating === 3) return 'mid';
  return 'low';
}

// ---------------------------------------------------------------------------
// generation
// ---------------------------------------------------------------------------

type GeneratedProduct = {
  slug: string;
  title: string;
  brand: string;
  description: string;
  bullets: string;
  specs: string;
  priceCents: number;
  listCents: number | null;
  stock: number;
  imageKeys: string;
  categoryId: string;
  createdAt: Date;
  searchText: string;
};

function generateProducts(
  rng: Rng,
  categorySlug: string,
  categoryId: string,
  priceRange: readonly [number, number],
): GeneratedProduct[] {
  const vocab = VOCABULARY[categorySlug];
  if (!vocab) throw new Error(`No vocabulary defined for category "${categorySlug}"`);

  const products: GeneratedProduct[] = [];
  const usedSlugs = new Set<string>();

  for (let i = 0; i < PRODUCTS_PER_CATEGORY; i++) {
    const brand = rng.pick(vocab.brands);
    const type = rng.pick(vocab.types);
    const qualifier = rng.pick(vocab.qualifiers);
    const variant = rng.pick(vocab.variants);

    const title = `${brand} ${qualifier} ${type} — ${variant}`;

    // Guarantee slug uniqueness without leaking a counter into most titles.
    let slug = slugify(title);
    if (usedSlugs.has(slug)) slug = `${slug}-${i}`;
    usedSlugs.add(slug);

    const priceCents = retailPrice(rng, priceRange);
    // ~45% of the catalog carries a visible discount.
    const listCents = rng.bool(0.45)
      ? Math.round((priceCents * rng.int(112, 168)) / 100 / 100) * 100
      : null;

    const bullets = rng.sample(vocab.features, rng.int(4, 5));

    const specKeys = Object.keys(vocab.specs);
    const specs: Record<string, string> = {};
    for (const key of specKeys) {
      const candidates = vocab.specs[key];
      if (candidates && candidates.length > 0) specs[key] = rng.pick(candidates);
    }

    const description = [
      rng.pick(DESCRIPTION_OPENERS),
      `The ${brand} ${type.toLowerCase()} is a ${qualifier.toLowerCase()} option in the ${variant} configuration.`,
      rng.pick(DESCRIPTION_CLOSERS),
    ].join(' ');

    // ~7% of the catalog is out of stock so empty/disabled states are demoable.
    const stock = rng.bool(0.07) ? 0 : rng.int(1, 240);

    const images = rng
      .sample(
        Array.from({ length: IMAGES_PER_CATEGORY }, (_, index) => imageKey(categorySlug, index)),
        rng.int(2, 4),
      );

    products.push({
      slug,
      title,
      brand,
      description,
      bullets: JSON.stringify(bullets),
      specs: JSON.stringify(specs),
      priceCents,
      listCents,
      stock,
      imageKeys: JSON.stringify(images),
      categoryId,
      createdAt: daysAgo(rng.int(0, 540), rng),
      // Lowercased blob backing LIKE-based search in Phase 6.
      searchText: [title, brand, type, categorySlug.replace(/-/g, ' '), ...bullets]
        .join(' ')
        .toLowerCase(),
    });
  }

  return products;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const rng = createRng(CATALOG_SEED);
  const startedAt = Date.now();

  console.log('Clearing existing data…');
  // Order matters: children before parents, since SQLite FKs are enforced.
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.cartItem.deleteMany();
  await db.cart.deleteMany();
  await db.review.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.address.deleteMany();
  await db.user.deleteMany();

  // --- categories ---------------------------------------------------------
  console.log('Creating categories…');
  const categoryIds = new Map<string, string>();
  for (const [index, category] of CATEGORIES.entries()) {
    const created = await db.category.create({
      data: {
        name: category.name,
        slug: category.slug,
        glyph: category.glyph,
        sortRank: index,
      },
    });
    categoryIds.set(category.slug, created.id);
  }

  // --- products -----------------------------------------------------------
  console.log('Creating products…');
  const allProducts: GeneratedProduct[] = [];
  for (const category of CATEGORIES) {
    const categoryId = categoryIds.get(category.slug)!;
    allProducts.push(...generateProducts(rng, category.slug, categoryId, category.priceRange));
  }

  // createMany is dramatically faster than 500 individual inserts.
  await db.product.createMany({ data: allProducts });

  const products = await db.product.findMany({
    select: { id: true, slug: true, title: true, priceCents: true, imageKeys: true, stock: true },
  });
  console.log(`  ${products.length} products`);

  // --- users --------------------------------------------------------------
  console.log('Creating users…');
  // Hash once: scrypt is deliberately slow, and every demo user shares a password.
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const users = [];
  for (const demo of DEMO_USERS) {
    const user = await db.user.create({
      data: {
        email: demo.email,
        name: demo.name,
        passwordHash,
        createdAt: daysAgo(rng.int(120, 900), rng),
        addresses: {
          create: {
            fullName: demo.name,
            line1: `${rng.int(1, 240)} ${rng.pick(['Lake View Road', 'Church Street', 'Nehru Marg', 'Hill Lane', 'Market Road'])}`,
            line2: rng.bool(0.4) ? `Flat ${rng.int(1, 40)}${rng.pick(['A', 'B', 'C'])}` : null,
            city: rng.pick(['Bengaluru', 'Mumbai', 'Pune', 'Chennai', 'Hyderabad']),
            state: rng.pick(['Karnataka', 'Maharashtra', 'Tamil Nadu', 'Telangana']),
            postalCode: String(rng.int(110001, 689999)),
            country: 'IN',
            phone: `+9198${rng.int(10000000, 99999999)}`,
            isDefault: true,
          },
        },
      },
      include: { addresses: true },
    });
    users.push(user);
  }
  console.log(`  ${users.length} sign-in users (password for all: ${DEMO_PASSWORD})`);

  // Reviewer pool: same password hash, no addresses, never advertised for sign-in.
  const reviewerRows: Array<{ email: string; name: string; passwordHash: string; createdAt: Date }> =
    [];
  const usedEmails = new Set<string>(DEMO_USERS.map((u) => u.email));

  for (let i = 0; i < REVIEWER_POOL_SIZE; i++) {
    const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    let email = `${slugify(name)}@example.com`;
    if (usedEmails.has(email)) email = `${slugify(name)}-${i}@example.com`;
    usedEmails.add(email);

    reviewerRows.push({ email, name, passwordHash, createdAt: daysAgo(rng.int(30, 900), rng) });
  }
  await db.user.createMany({ data: reviewerRows });

  // Everyone who can author a review: demo users plus the pool.
  const reviewers = await db.user.findMany({ select: { id: true } });
  console.log(`  ${reviewers.length} total accounts (${REVIEWER_POOL_SIZE} review-only)`);

  // --- reviews ------------------------------------------------------------
  console.log('Creating reviews…');
  const reviewRows: Array<{
    productId: string;
    userId: string;
    rating: number;
    title: string;
    body: string;
    createdAt: Date;
  }> = [];

  const ratingTally = new Map<string, { sum: number; count: number }>();

  for (const product of products) {
    if (reviewRows.length >= REVIEWS_TARGET) break;

    // Most products get a handful of reviews; some get none, to exercise the
    // "no reviews yet" state on the product page.
    const reviewerCount = rng.bool(0.12) ? 0 : rng.int(1, 12);
    const chosen = rng.sample(reviewers, reviewerCount);

    for (const reviewer of chosen) {
      const rating = skewedRating(rng);
      const band = ratingBand(rating);

      reviewRows.push({
        productId: product.id,
        userId: reviewer.id,
        rating,
        title: rng.pick(REVIEW_TITLES[band]),
        body: rng.pick(REVIEW_BODIES[band]),
        createdAt: daysAgo(rng.int(0, 400), rng),
      });

      const tally = ratingTally.get(product.id) ?? { sum: 0, count: 0 };
      tally.sum += rating;
      tally.count += 1;
      ratingTally.set(product.id, tally);
    }
  }

  await db.review.createMany({ data: reviewRows });
  console.log(`  ${reviewRows.length} reviews`);

  // --- denormalised rating aggregates -------------------------------------
  console.log('Computing rating aggregates…');
  // Batched in a transaction: 500 individual UPDATEs outside one is ~20x slower.
  const updates = [...ratingTally.entries()].map(([productId, tally]) =>
    db.product.update({
      where: { id: productId },
      data: {
        // One decimal place is all the UI ever displays.
        ratingAvg: Math.round((tally.sum / tally.count) * 10) / 10,
        ratingCount: tally.count,
      },
    }),
  );
  await db.$transaction(updates);
  console.log(`  ${updates.length} products have ratings`);

  // --- orders -------------------------------------------------------------
  console.log('Creating orders…');
  const inStock = products.filter((product) => product.stock > 0);

  for (let i = 0; i < ORDERS_TO_CREATE; i++) {
    const user = rng.pick(users);
    const address = user.addresses[0]!;
    const lineProducts = rng.sample(inStock, rng.int(1, 3));
    const deliveryOption: DeliveryOption = rng.bool(0.3) ? 'express' : 'standard';

    const lines = lineProducts.map((product) => ({
      product,
      qty: rng.int(1, 3),
      unitCents: product.priceCents,
    }));

    const totals = computeTotals(lines, deliveryOption);
    const placedAt = daysAgo(rng.int(2, 240), rng);
    const etaDays = deliveryOption === 'express' ? 2 : 5;

    await db.order.create({
      data: {
        number: `TS-${2026}-${String(1000 + i)}`,
        userId: user.id,
        // Older orders read as delivered; recent ones are still in flight.
        status: rng.pick(['delivered', 'delivered', 'shipped', 'placed'] as const),
        shipToName: address.fullName,
        shipToLine1: address.line1,
        shipToLine2: address.line2,
        shipToCity: address.city,
        shipToState: address.state,
        shipToPostal: address.postalCode,
        shipToCountry: address.country,
        shipToPhone: address.phone,
        addressId: address.id,
        subtotalCents: totals.subtotalCents,
        shippingCents: totals.shippingCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        deliveryOption,
        paymentLabel: `Card ending ${rng.int(1000, 9999)}`,
        idempotencyKey: `seed-order-${i}`,
        placedAt,
        etaAt: new Date(placedAt.getTime() + etaDays * 24 * 60 * 60 * 1000),
        items: {
          create: lines.map(({ product, qty, unitCents }) => ({
            productId: product.id,
            titleSnapshot: product.title,
            slugSnapshot: product.slug,
            imageSnapshot: (JSON.parse(product.imageKeys) as string[])[0] ?? '',
            unitCents,
            qty,
          })),
        },
      },
    });
  }
  console.log(`  ${ORDERS_TO_CREATE} orders`);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nSeed complete in ${elapsed}s.`);
  console.log(`Sign in with any of: ${DEMO_USERS.map((u) => u.email).join(', ')}`);
  console.log(`Password: ${DEMO_PASSWORD}`);
}

try {
  await main();
} finally {
  await db.$disconnect();
}
