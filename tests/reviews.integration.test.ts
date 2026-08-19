/**
 * The review submission flow, end to end against a real server and database.
 *
 * This is where Phase 3's central claim is checked: a review changes the product's
 * denormalised `ratingAvg`/`ratingCount` in the same transaction that writes it, so the
 * figures the listing page shows can never be observed disagreeing with the review rows.
 *
 * The tests write real rows, so each cleans up in `afterAll` and restores the aggregates by
 * re-deriving them — otherwise a second run would hit the one-review-per-user constraint and
 * fail for the wrong reason.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type TestServer } from './helpers/server';
import { deleteReviewsAndRestoreAggregates, testDb } from './helpers/db';
import { loginAs } from './helpers/auth';

let server: TestServer;
let baseUrl: string;
let productSlug: string;
let productId: string;
const createdReviewIds: string[] = [];

/** Cached per account — the login endpoint is rate-limited. See helpers/auth.ts. */
const login = (email: string) => loginAs(baseUrl, email);

async function postReview(
  cookie: string | null,
  slug: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${baseUrl}/api/products/${slug}/reviews`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie === null ? {} : { cookie }),
    },
    body: JSON.stringify(payload),
  });
}

async function productAggregates(slug: string) {
  const row = await testDb.product.findUnique({
    where: { slug },
    select: { ratingAvg: true, ratingCount: true },
  });
  expect(row).not.toBeNull();
  return row!;
}

beforeAll(async () => {
  server = await startServer();
  baseUrl = server.baseUrl;

  // Pick a product nobody has reviewed, so aggregate arithmetic is unambiguous.
  const candidate = await testDb.product.findFirst({
    where: { ratingCount: 0 },
    select: { id: true, slug: true },
  });
  expect(candidate, 'the seed should leave some products unreviewed').not.toBeNull();
  productId = candidate!.id;
  productSlug = candidate!.slug;
}, 120_000);

afterAll(async () => {
  await deleteReviewsAndRestoreAggregates(productId, createdReviewIds);
  await testDb.$disconnect();
  await server?.stop();
});

describe('authorisation', () => {
  it('rejects a review from a signed-out visitor', async () => {
    const response = await postReview(null, productSlug, {
      rating: 5,
      title: 'Anonymous',
      body: 'This should not be accepted without a session.',
    });
    expect(response.status).toBe(401);
  });

  it('rejects a cross-site submission even with a valid session', async () => {
    // SameSite=Lax already blocks the cookie being sent; this is the second layer.
    const cookie = await login('dan@example.com');
    const response = await fetch(`${baseUrl}/api/products/${productSlug}/reviews`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
        'sec-fetch-site': 'cross-site',
      },
      body: JSON.stringify({ rating: 5, title: 'Forged', body: 'Submitted from another site.' }),
    });
    expect(response.status).toBe(403);
  });
});

describe('submission and aggregates', () => {
  it('accepts a review and recomputes the aggregates in the same write', async () => {
    const before = await productAggregates(productSlug);
    expect(before.ratingCount).toBe(0);

    const cookie = await login('asha@example.com');
    const response = await postReview(cookie, productSlug, {
      rating: 4,
      title: 'Good value',
      body: 'Solid build and it arrived a day early.',
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      review: { id: string; rating: number; authorName: string; isOwn: boolean };
      ratingAvg: number;
      ratingCount: number;
    };
    createdReviewIds.push(payload.review.id);

    expect(payload.review.rating).toBe(4);
    expect(payload.review.authorName).toBe('Asha Menon');
    expect(payload.review.isOwn).toBe(true);
    expect(payload.ratingAvg).toBe(4);
    expect(payload.ratingCount).toBe(1);

    // The response is only a claim; the stored row is the fact.
    const after = await productAggregates(productSlug);
    expect(after.ratingAvg).toBe(4);
    expect(after.ratingCount).toBe(1);
  });

  it('averages across reviewers and stays to one decimal place', async () => {
    const cookie = await login('ravi@example.com');
    const response = await postReview(cookie, productSlug, {
      rating: 2,
      title: 'Not for me',
      body: 'The fit was too tight around the temples for my head shape.',
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as { review: { id: string }; ratingAvg: number; ratingCount: number };
    createdReviewIds.push(payload.review.id);

    // (4 + 2) / 2
    expect(payload.ratingAvg).toBe(3);
    expect(payload.ratingCount).toBe(2);

    const stored = await productAggregates(productSlug);
    expect(stored.ratingAvg).toBe(3);
    expect(stored.ratingCount).toBe(2);
  });

  it('allows only one review per user per product', async () => {
    const cookie = await login('asha@example.com');
    const response = await postReview(cookie, productSlug, {
      rating: 1,
      title: 'Second attempt',
      body: 'Trying to review the same product twice.',
    });

    expect(response.status).toBe(409);

    // The rejected attempt must not have moved the average.
    const stored = await productAggregates(productSlug);
    expect(stored.ratingCount).toBe(2);
    expect(stored.ratingAvg).toBe(3);
  });

  it('404s a review for a product that does not exist', async () => {
    const cookie = await login('sofia@example.com');
    const response = await postReview(cookie, 'no-such-product-slug', {
      rating: 5,
      title: 'Ghost product',
      body: 'There is no product at this slug.',
    });
    expect(response.status).toBe(404);
  });
});

describe('validation', () => {
  it('rejects an out-of-range rating with per-field messages', async () => {
    const cookie = await login('dan@example.com');
    const response = await postReview(cookie, productSlug, { rating: 9, title: 'x', body: 'y' });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as {
      error: { code: string; fields?: Record<string, string> };
    };
    expect(payload.error.code).toBe('bad_request');
    // Every invalid field is reported, so the form can mark all of them at once.
    expect(Object.keys(payload.error.fields ?? {}).sort()).toEqual(['body', 'rating', 'title']);
  });

  it('rejects a non-JSON body', async () => {
    const cookie = await login('dan@example.com');
    const response = await fetch(`${baseUrl}/api/products/${productSlug}/reviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: 'not json at all',
    });
    expect(response.status).toBe(400);
  });
});

describe('stored XSS', () => {
  it('renders an injected script tag as text, in both the DOM and the flight payload', async () => {
    const cookie = await login('meera@example.com');
    const payload = '<script>alert("xss")</script><img src=x onerror=alert(1)>';

    const response = await postReview(cookie, productSlug, {
      rating: 3,
      title: 'Markup test',
      body: `${payload} plus enough characters to satisfy validation.`,
    });
    expect(response.status).toBe(201);
    createdReviewIds.push(((await response.json()) as { review: { id: string } }).review.id);

    const html = await (await fetch(`${baseUrl}/p/${productSlug}`)).text();

    // The visible markup must contain the escaped form, never a live tag.
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');

    /*
     * The subtler check. React also serialises props into the RSC flight payload inside
     * <script> blocks. A raw `</script>` in that string would close the element early and
     * hand the rest to the HTML parser — real XSS. React escapes `<` to < to prevent it,
     * so every closing tag in the document must pair with an opening one.
     */
    const openTags = html.match(/<script[\s>]/g)?.length ?? 0;
    const closeTags = html.match(/<\/script>/g)?.length ?? 0;
    expect(closeTags, 'a stray </script> means the payload broke out').toBe(openTags);
  });
});

describe('aggregate consistency', () => {
  it('every product’s stored aggregates match its actual reviews', async () => {
    /*
     * The invariant that justifies denormalising `ratingAvg`/`ratingCount` in the first
     * place. If it can drift, the listing page is quietly lying on every card, and no
     * single-product test would notice. Checked across the whole catalog.
     */
    const products = await testDb.product.findMany({
      select: { id: true, slug: true, ratingAvg: true, ratingCount: true },
    });
    expect(products.length).toBeGreaterThan(100);

    /*
     * One groupBy rather than an aggregate() per product. The per-product loop was fine against
     * a local SQLite file, where a query is a function call; against a network database it is 500
     * sequential round trips and takes longer than any sane test timeout allows.
     *
     * The invariant checked is identical — this only changes how many times we ask.
     */
    const grouped = await testDb.review.groupBy({
      by: ['productId'],
      _avg: { rating: true },
      _count: { _all: true },
    });
    const actual = new Map(grouped.map((row) => [row.productId, row]));

    const mismatches: string[] = [];
    for (const product of products) {
      // A product with no reviews is absent from the grouping, and must read as 0/0 rather than
      // being skipped — "never reviewed" is exactly the case where a stale aggregate would hide.
      const aggregate = actual.get(product.id);
      const expectedAvg = Math.round(((aggregate?._avg.rating ?? 0) as number) * 10) / 10;
      const expectedCount = aggregate?._count._all ?? 0;

      if (expectedAvg !== product.ratingAvg || expectedCount !== product.ratingCount) {
        mismatches.push(
          `${product.slug}: stored ${product.ratingAvg}/${product.ratingCount}, ` +
            `actual ${expectedAvg}/${expectedCount}`,
        );
      }
    }

    expect(mismatches).toEqual([]);
  }, 60_000);
});

describe('review listing', () => {
  it('paginates with the same cursor contract as the catalog', async () => {
    // A seeded product with many reviews, so there is a second page to fetch.
    const busy = await testDb.product.findFirst({
      where: { ratingCount: { gte: 4 } },
      select: { slug: true, ratingCount: true },
    });
    expect(busy).not.toBeNull();

    const first = await fetch(`${baseUrl}/api/products/${busy!.slug}/reviews?limit=2`);
    expect(first.status).toBe(200);
    const page1 = (await first.json()) as { items: Array<{ id: string }>; nextCursor: string | null };
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const second = await fetch(
      `${baseUrl}/api/products/${busy!.slug}/reviews?limit=2&cursor=${encodeURIComponent(page1.nextCursor!)}`,
    );
    const page2 = (await second.json()) as { items: Array<{ id: string }> };

    const ids = [...page1.items, ...page2.items].map((item) => item.id);
    expect(new Set(ids).size, 'pages must not overlap').toBe(ids.length);
  });

  it('sorts by rating in both directions', async () => {
    const busy = await testDb.product.findFirst({
      where: { ratingCount: { gte: 4 } },
      select: { slug: true },
    });

    for (const [sort, compare] of [
      ['highest', (a: number, b: number) => b <= a],
      ['lowest', (a: number, b: number) => b >= a],
    ] as const) {
      const response = await fetch(`${baseUrl}/api/products/${busy!.slug}/reviews?sort=${sort}`);
      const page = (await response.json()) as { items: Array<{ rating: number }> };

      for (let i = 1; i < page.items.length; i++) {
        expect(compare(page.items[i - 1]!.rating, page.items[i]!.rating)).toBe(true);
      }
    }
  });

  it('marks the caller’s own review and nobody else’s', async () => {
    const cookie = await login('asha@example.com');
    const response = await fetch(`${baseUrl}/api/products/${productSlug}/reviews`, {
      headers: { cookie },
    });
    const page = (await response.json()) as { items: Array<{ authorName: string; isOwn: boolean }> };

    const own = page.items.filter((item) => item.isOwn);
    expect(own).toHaveLength(1);
    expect(own[0]!.authorName).toBe('Asha Menon');
  });

  it('never lets a per-user response be cached by a shared cache', async () => {
    // isOwn is per-user, so a shared cache would show one visitor another's flags.
    const response = await fetch(`${baseUrl}/api/products/${productSlug}/reviews`);
    expect(response.headers.get('cache-control')).toContain('private');
  });
});
