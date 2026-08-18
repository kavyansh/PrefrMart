import type { NextRequest } from 'next/server';
import { apiError, guarded, ok, validationError } from '@/lib/api/response';
import { isSameOrigin } from '@/lib/api/request';
import { getSessionUserId } from '@/lib/auth/session';
import { mergeGuestCart } from '@/lib/cart/server';
import { normalizeLines } from '@/lib/cart/merge';
import { cartLinesSchema } from '@/lib/validation/schemas';

/**
 * POST /api/cart/merge — fold a guest cart into the signed-in user's cart.
 *
 * Called once, right after signing in. Quantities are summed rather than replaced: overwriting
 * would silently discard whichever basket the shopper did not touch most recently, and they have
 * no way to know which that was.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return guarded('cart.merge', async () => {
    if (!isSameOrigin(request)) {
      return apiError('forbidden', 'Cross-origin requests are not allowed.');
    }

    const userId = await getSessionUserId();
    if (userId === null) return apiError('unauthorized', 'Sign in to merge your cart.');

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return apiError('bad_request', 'Expected a JSON body.');
    }

    const parsed = cartLinesSchema.safeParse(payload);
    if (!parsed.success) return validationError(parsed.error);

    const view = await mergeGuestCart(userId, normalizeLines(parsed.data.lines));

    return ok(view, { headers: { 'cache-control': 'private, no-store' } });
  });
}
