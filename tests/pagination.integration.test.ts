/**
 * Walks the real catalog through the real API, one cursor at a time.
 *
 * This is the test that protects requirement 1: scroll to the end and see every product
 * exactly once, under every sort, across page boundaries. Unit tests cover the cursor
 * helpers in isolation and cannot see whether the cursor, the ORDER BY and the data agree.
 *
 * Known limit, measured rather than assumed: this does NOT catch a missing `id` tiebreaker
 * in ORDER_BY. Removing one and re-running leaves all of these green, because SQLite's
 * index scan happens to order tied rows consistently, which is exactly what Prisma's
 * fallback query relies on. The tiebreaker still belongs there — see the note in
 * lib/catalog/products.ts — but do not read a pass here as proof it is present.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type TestServer } from './helpers/server';

type Item = { id: string; slug: string; priceCents: number; ratingAvg: number; stock: number };
type Page = { items: Item[]; nextCursor: string | null };

let server: TestServer;

beforeAll(async () => {
  server = await startServer();
}, 120_000);

afterAll(async () => {
  await server?.stop();
});

/** Page through a query to exhaustion, returning every item in the order received. */
async function walkAll(query: string, pageSize = 25): Promise<Item[]> {
  const collected: Item[] = [];
  let cursor: string | null = null;
  // Generous ceiling: 504 products at 25 a page is ~21 requests. Guards a cursor bug
  // that would otherwise loop forever.
  const maxPages = 60;

  for (let page = 0; page < maxPages; page++) {
    const url = `${server.baseUrl}/api/products?${query}&limit=${pageSize}${
      cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`
    }`;

    const response = await fetch(url);
    expect(response.status).toBe(200);

    const body = (await response.json()) as Page;
    collected.push(...body.items);

    if (body.nextCursor === null) return collected;
    cursor = body.nextCursor;
  }

  throw new Error(`Pagination did not terminate within ${maxPages} pages for "${query}"`);
}

const SORTS = ['newest', 'price-asc', 'price-desc', 'rating'] as const;

describe.each(SORTS)('sort=%s', (sort) => {
  it('yields every product exactly once', async () => {
    const items = await walkAll(`sort=${sort}`);
    const ids = items.map((item) => item.id);

    expect(new Set(ids).size, 'duplicate products across pages').toBe(ids.length);
    // The seed creates 504; asserting the exact figure also catches a page silently
    // dropping rows.
    expect(items.length).toBe(504);
  }, 60_000);

  it('holds its sort order across page boundaries', async () => {
    // A cursor bug frequently shows up as order breaking exactly where one page ends and
    // the next begins, which is invisible when checking a single page.
    const items = await walkAll(`sort=${sort}`);

    for (let i = 1; i < items.length; i++) {
      const previous = items[i - 1]!;
      const current = items[i]!;

      if (sort === 'price-asc') {
        expect(current.priceCents).toBeGreaterThanOrEqual(previous.priceCents);
      } else if (sort === 'price-desc') {
        expect(current.priceCents).toBeLessThanOrEqual(previous.priceCents);
      } else if (sort === 'rating') {
        expect(current.ratingAvg).toBeLessThanOrEqual(previous.ratingAvg);
      }
    }
  }, 60_000);
});

describe('pagination with filters', () => {
  it('stays consistent for a filtered set', async () => {
    const items = await walkAll('category=electronics&sort=price-asc', 10);
    const ids = items.map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
    // 8 categories x 63 products.
    expect(items.length).toBe(63);
  }, 60_000);

  it('respects the in-stock filter on every page', async () => {
    const items = await walkAll('inStock=true', 10);
    expect(items.every((item) => item.stock > 0)).toBe(true);
  }, 60_000);

  it('respects a price band on every page', async () => {
    const items = await walkAll('minPrice=100000&maxPrice=500000', 10);
    expect(items.every((item) => item.priceCents >= 100_000 && item.priceCents <= 500_000)).toBe(
      true,
    );
  }, 60_000);

  it('returns an empty page rather than an error for an impossible filter', async () => {
    const response = await fetch(
      `${server.baseUrl}/api/products?minPrice=99999999&maxPrice=100000000`,
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as Page;
    expect(body.items).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });
});

describe('page size', () => {
  it('honours the requested limit', async () => {
    const response = await fetch(`${server.baseUrl}/api/products?limit=7`);
    const body = (await response.json()) as Page;
    expect(body.items).toHaveLength(7);
  });

  it('rejects a limit above the maximum instead of returning the whole table', async () => {
    const response = await fetch(`${server.baseUrl}/api/products?limit=5000`);
    expect(response.status).toBe(400);
  });

  it('never returns the over-fetched probe row to the client', async () => {
    // toPage() fetches limit+1 to learn whether more exist; that extra row must be
    // trimmed, or every page would show one item too many.
    const response = await fetch(`${server.baseUrl}/api/products?limit=3`);
    const body = (await response.json()) as Page;
    expect(body.items).toHaveLength(3);
    expect(body.nextCursor).not.toBeNull();
  });
});
