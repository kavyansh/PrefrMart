import type { NextRequest } from 'next/server';
import { apiError, guarded, ok, validationError } from '@/lib/api/response';
import { getSessionUserId } from '@/lib/auth/session';
import { listOrders } from '@/lib/orders/queries';
import { orderListQuerySchema, searchParamsToObject } from '@/lib/validation/schemas';

/**
 * GET /api/account/orders — the caller's own orders, cursor-paginated.
 *
 * There is no user id in the query: the session decides whose orders these are. Accepting one
 * would be an invitation to read someone else's history by changing a number.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return guarded('account.orders', async () => {
    const userId = await getSessionUserId();
    if (userId === null) return apiError('unauthorized', 'Sign in to view your orders.');

    const parsed = orderListQuerySchema.safeParse(
      searchParamsToObject(request.nextUrl.searchParams),
    );
    if (!parsed.success) return validationError(parsed.error);

    const page = await listOrders({
      userId,
      cursor: parsed.data.cursor,
      limit: parsed.data.limit,
    });

    return ok(page, {
      // Private data: must never reach a shared cache.
      headers: { 'cache-control': 'private, no-store' },
    });
  });
}
