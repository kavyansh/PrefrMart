import type { NextRequest } from 'next/server';
import { apiError, guarded, ok, validationError } from '@/lib/api/response';
import { isSameOrigin } from '@/lib/api/request';
import { getSessionUserId } from '@/lib/auth/session';
import { getServerCart, replaceServerCart } from '@/lib/cart/server';
import { normalizeLines } from '@/lib/cart/merge';
import { cartLinesSchema } from '@/lib/validation/schemas';

/**
 * GET /api/cart — the signed-in user's cart
 * PUT /api/cart — replace it with the supplied lines
 *
 * PUT replaces rather than patching. The client always sends its complete line set, which makes
 * the operation idempotent and removes the class of bugs where two in-flight quantity changes
 * race and one is lost. A cart is a handful of rows, so rewriting it is cheap.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE = { 'cache-control': 'private, no-store' } as const;

export async function GET() {
  return guarded('cart.get', async () => {
    const userId = await getSessionUserId();
    if (userId === null) return apiError('unauthorized', 'Sign in to see your saved cart.');

    return ok(await getServerCart(userId), { headers: PRIVATE });
  });
}

export async function PUT(request: NextRequest) {
  return guarded('cart.put', async () => {
    if (!isSameOrigin(request)) {
      return apiError('forbidden', 'Cross-origin requests are not allowed.');
    }

    const userId = await getSessionUserId();
    if (userId === null) return apiError('unauthorized', 'Sign in to save your cart.');

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return apiError('bad_request', 'Expected a JSON body.');
    }

    const parsed = cartLinesSchema.safeParse(payload);
    if (!parsed.success) return validationError(parsed.error);

    // Schema-validated, then normalised: normalizeLines also collapses duplicate product ids,
    // which the schema permits and the database's unique constraint would reject.
    const view = await replaceServerCart(userId, normalizeLines(parsed.data.lines));

    return ok(view, { headers: PRIVATE });
  });
}
