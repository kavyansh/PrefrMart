import type { NextRequest } from 'next/server';
import { apiError, guarded, ok, validationError } from '@/lib/api/response';
import { isSameOrigin } from '@/lib/api/request';
import { getSessionUserId } from '@/lib/auth/session';
import { placeOrder } from '@/lib/orders/place';
import { callerKey, rateLimit } from '@/lib/rateLimit';
import { placeOrderSchema } from '@/lib/validation/schemas';

/** POST /api/orders — place an order from the signed-in user's cart. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Generous for a real shopper, tight enough that a script cannot hammer stock decrements.
const ORDER_RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };

export async function POST(request: NextRequest) {
  return guarded('orders.create', async () => {
    if (!isSameOrigin(request)) {
      return apiError('forbidden', 'Cross-origin requests are not allowed.');
    }

    const userId = await getSessionUserId();
    if (userId === null) return apiError('unauthorized', 'Sign in to place an order.');

    const limited = rateLimit({ key: callerKey(request, `order:${userId}`), ...ORDER_RATE_LIMIT });
    if (!limited.allowed) {
      return apiError('rate_limited', 'Too many orders placed recently.');
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return apiError('bad_request', 'Expected a JSON body.');
    }

    const parsed = placeOrderSchema.safeParse(payload);
    if (!parsed.success) return validationError(parsed.error);

    // Exactly one address source. Accepting both would leave which one wins as an accident of
    // implementation order.
    const hasSaved = parsed.data.addressId !== undefined;
    const hasNew = parsed.data.address !== undefined;
    if (hasSaved === hasNew) {
      return apiError('bad_request', 'Provide either a saved address or a new one.', {
        address: 'Choose a delivery address.',
      });
    }

    const result = await placeOrder({ userId, input: parsed.data });

    if (!result.ok) {
      switch (result.reason) {
        case 'empty_cart':
          return apiError('conflict', 'Your cart is empty.');
        case 'key_conflict':
          // Deliberately generic: confirming the key is in use would leak that an order exists.
          return apiError('conflict', 'Could not place that order. Please try again.');
        case 'no_address':
          return apiError('bad_request', 'That delivery address could not be used.', {
            address: 'Choose a delivery address.',
          });
        case 'insufficient_stock':
          // Names the specific items, so the shopper can fix the cart rather than guess.
          return apiError(
            'conflict',
            `Some items are no longer available in the quantity you wanted: ${result.problems
              .map((problem) => `${problem.title} (${problem.available} left)`)
              .join(', ')}`,
          );
      }
    }

    return ok(
      { orderId: result.orderId, orderNumber: result.orderNumber, reused: result.reused },
      // 201 for a new order; 200 when an idempotent retry returned the existing one.
      { status: result.reused ? 200 : 201, headers: { 'cache-control': 'private, no-store' } },
    );
  });
}
