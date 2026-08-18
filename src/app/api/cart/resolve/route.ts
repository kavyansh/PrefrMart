import type { NextRequest } from 'next/server';
import { apiError, guarded, ok, validationError } from '@/lib/api/response';
import { resolveLines } from '@/lib/cart/server';
import { normalizeLines } from '@/lib/cart/merge';
import { cartLinesSchema } from '@/lib/validation/schemas';

/**
 * POST /api/cart/resolve — turn `{ productId, qty }` lines into a displayable cart.
 *
 * Public, because this is how a *guest* cart gets its prices, titles and stock. The guest's lines
 * live in IndexedDB; only ids and quantities are stored there, so the server is still the only
 * source of pricing. That is the whole point: a tampered local cart can change what is being
 * bought, never what it costs.
 *
 * POST rather than GET because a cart can hold enough ids to exceed a sensible URL length, and
 * because a shopper's basket does not belong in access logs or a shared cache.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return guarded('cart.resolve', async () => {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return apiError('bad_request', 'Expected a JSON body.');
    }

    const parsed = cartLinesSchema.safeParse(payload);
    if (!parsed.success) return validationError(parsed.error);

    const view = await resolveLines(normalizeLines(parsed.data.lines));

    return ok(view, { headers: { 'cache-control': 'private, no-store' } });
  });
}
