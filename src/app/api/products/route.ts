import type { NextRequest } from 'next/server';
import { listProducts } from '@/lib/catalog/products';
import { guarded, ok, validationError } from '@/lib/api/response';
import { productListQuerySchema, searchParamsToObject } from '@/lib/validation/schemas';

/**
 * GET /api/products — cursor-paginated catalog.
 *
 * Query: cursor, limit, category, sort, minPrice, maxPrice, minRating, inStock, q
 * Returns: { items: ProductListItem[], nextCursor: string | null }
 *
 * The infinite-scroll client calls this for every page after the first; the first
 * page is rendered on the server so the catalog is visible without waiting on JS.
 */

// Prisma needs the Node runtime; it cannot run on Edge.
export const runtime = 'nodejs';
// The response depends entirely on the query string, so there is nothing to
// prerender. Caching happens at the CDN via the Cache-Control header below.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return guarded('products.list', async () => {
    const parsed = productListQuerySchema.safeParse(
      searchParamsToObject(request.nextUrl.searchParams),
    );

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const page = await listProducts(parsed.data);

    return ok(page, {
      headers: {
        // Safe to cache at the edge briefly; the payload is public and identical per query.
        'cache-control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  });
}
