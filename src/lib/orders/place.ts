import { db } from '@/lib/db';
import { computeTotals, type DeliveryOption } from '@/lib/money';
import type { PlaceOrderInput } from '@/lib/validation/schemas';

/**
 * Order placement.
 *
 * Everything that must not be observable half-done happens in one transaction: re-read stock,
 * verify it, decrement it, create the order and its snapshotted items, and empty the cart. Done as
 * separate statements, a crash between them leaves stock decremented with no order to show for it,
 * or an order for goods that were never reserved.
 *
 * Two other decisions carry weight here:
 *
 *  - Prices and quantities come from the server's cart and product rows, never the request. The
 *    client sends only choices — address, delivery speed, a card display label. A client that
 *    could send line prices could name its own total.
 *
 *  - Stock is re-read inside the transaction rather than trusted from the cart view the shopper
 *    was looking at. That view may be minutes old, and the last unit may be gone.
 */

export type PlaceOrderResult =
  | { ok: true; orderId: string; orderNumber: string; reused: boolean }
  | { ok: false; reason: 'empty_cart' }
  | { ok: false; reason: 'key_conflict' }
  | { ok: false; reason: 'no_address' }
  | { ok: false; reason: 'insufficient_stock'; problems: Array<{ title: string; available: number }> };

/** Human-facing order reference. Random suffix so numbers are not guessable or sequential. */
function generateOrderNumber(): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TS-2026-${suffix}`;
}

export async function placeOrder({
  userId,
  input,
}: {
  userId: string;
  input: PlaceOrderInput;
}): Promise<PlaceOrderResult> {
  /*
   * Idempotency check before doing any work. A shopper who double-taps Place Order, or whose
   * connection drops after the request left the browser, must end up with one order — and must be
   * shown that order rather than an error.
   */
  const existing = await db.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true, number: true, userId: true },
  });

  if (existing !== null) {
    /*
     * Scoped to the owner. A guessed key must not return somebody else's order, and the refusal
     * must not confirm that the key exists either — hence a generic conflict rather than a
     * message that distinguishes "taken" from "unusable".
     */
    if (existing.userId !== userId) return { ok: false, reason: 'key_conflict' };
    return { ok: true, orderId: existing.id, orderNumber: existing.number, reused: true };
  }

  const deliveryOption: DeliveryOption = input.deliveryOption;

  try {
    return await db.$transaction(async (tx) => {
      const cart = await tx.cart.findFirst({
        where: { userId, status: 'open' },
        select: {
          id: true,
          items: {
            select: {
              productId: true,
              qty: true,
              product: {
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  priceCents: true,
                  currency: true,
                  stock: true,
                  imageKeys: true,
                },
              },
            },
          },
        },
      });

      if (cart === null || cart.items.length === 0) {
        return { ok: false as const, reason: 'empty_cart' as const };
      }

      // Stock as it is right now, not as the cart page showed it.
      const problems: Array<{ title: string; available: number }> = [];
      for (const item of cart.items) {
        if (item.product.stock < item.qty) {
          problems.push({ title: item.product.title, available: item.product.stock });
        }
      }
      if (problems.length > 0) {
        return { ok: false as const, reason: 'insufficient_stock' as const, problems };
      }

      // --- resolve the delivery address ------------------------------------
      let address: {
        id: string | null;
        fullName: string;
        line1: string;
        line2: string | null;
        city: string;
        state: string;
        postalCode: string;
        country: string;
        phone: string;
      };

      if (input.addressId !== undefined) {
        // Scoped by userId: an address id belonging to someone else must not be usable.
        const saved = await tx.address.findFirst({
          where: { id: input.addressId, userId },
          select: {
            id: true,
            fullName: true,
            line1: true,
            line2: true,
            city: true,
            state: true,
            postalCode: true,
            country: true,
            phone: true,
          },
        });
        if (saved === null) return { ok: false as const, reason: 'no_address' as const };
        address = saved;
      } else if (input.address !== undefined) {
        const created = await tx.address.create({
          data: {
            userId,
            fullName: input.address.fullName,
            line1: input.address.line1,
            line2: input.address.line2 ?? null,
            city: input.address.city,
            state: input.address.state,
            postalCode: input.address.postalCode,
            country: input.address.country,
            phone: input.address.phone,
            // First address becomes the default; later ones do not silently take over.
            isDefault: (await tx.address.count({ where: { userId } })) === 0,
          },
          select: {
            id: true,
            fullName: true,
            line1: true,
            line2: true,
            city: true,
            state: true,
            postalCode: true,
            country: true,
            phone: true,
          },
        });
        address = created;
      } else {
        return { ok: false as const, reason: 'no_address' as const };
      }

      // --- totals, computed server-side ------------------------------------
      const lines = cart.items.map((item) => ({
        unitCents: item.product.priceCents,
        qty: item.qty,
      }));
      const totals = computeTotals(lines, deliveryOption);

      // --- decrement stock -------------------------------------------------
      for (const item of cart.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.qty } },
        });
      }

      // --- create the order ------------------------------------------------
      const etaDays = deliveryOption === 'express' ? 2 : 5;
      const placedAt = new Date();

      const order = await tx.order.create({
        data: {
          number: generateOrderNumber(),
          userId,
          status: 'placed',
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
          currency: cart.items[0]?.product.currency ?? 'INR',
          deliveryOption,
          paymentLabel: input.paymentLabel,
          idempotencyKey: input.idempotencyKey,
          placedAt,
          etaAt: new Date(placedAt.getTime() + etaDays * 24 * 60 * 60 * 1000),
          items: {
            create: cart.items.map((item) => ({
              productId: item.productId,
              // Snapshots: what was bought, at the price paid, under the name it had.
              titleSnapshot: item.product.title,
              slugSnapshot: item.product.slug,
              imageSnapshot: firstImage(item.product.imageKeys),
              unitCents: item.product.priceCents,
              qty: item.qty,
            })),
          },
        },
        select: { id: true, number: true },
      });

      // --- retire the cart --------------------------------------------------
      // Marked converted rather than deleted, so the cart that produced an order is still
      // traceable. A fresh open cart is created lazily on the next add.
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({ where: { id: cart.id }, data: { status: 'converted' } });

      return { ok: true as const, orderId: order.id, orderNumber: order.number, reused: false };
    });
  } catch (error) {
    /*
     * Two concurrent submissions with the same key can both pass the check above. The unique
     * constraint is the real guarantee; losing that race means the other request already created
     * the order, so return it rather than an error.
     */
    if (isUniqueViolation(error)) {
      const winner = await db.order.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true, number: true, userId: true },
      });
      if (winner !== null && winner.userId === userId) {
        return { ok: true, orderId: winner.id, orderNumber: winner.number, reused: true };
      }
    }
    throw error;
  }
}

function firstImage(imageKeys: string): string {
  try {
    const parsed = JSON.parse(imageKeys) as unknown;
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0];
  } catch {
    // Fall through to an empty key; the UI renders a placeholder.
  }
  return '';
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
