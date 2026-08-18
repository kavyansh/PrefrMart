import { MAX_CART_LINES, MAX_QTY_PER_LINE, type CartLine } from '@/lib/cart/types';

/**
 * Pure cart arithmetic: normalising, merging, and clamping to stock.
 *
 * Kept free of database and network so the rules can be tested directly. The interesting one is
 * merge-on-login, where a shopper who filled a basket as a guest then signs in must not lose
 * either basket — and must not silently end up with twelve of something because both baskets
 * had six.
 */

/**
 * Sanitise lines arriving from a client (IndexedDB, or a request body).
 *
 * Drops anything malformed rather than throwing: a corrupt local cart should degrade to a
 * smaller cart, never a broken page. Duplicate product ids are summed, since two entries for the
 * same product are a bug in whatever produced them, not a user intent to have two lines.
 */
export function normalizeLines(input: unknown): CartLine[] {
  if (!Array.isArray(input)) return [];

  const byProduct = new Map<string, number>();

  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) continue;

    const { productId, qty } = raw as { productId?: unknown; qty?: unknown };
    if (typeof productId !== 'string' || productId === '') continue;
    // Reject anything that is not a plausible record id, so a hostile value never reaches a query.
    if (!/^[a-z0-9]{20,40}$/i.test(productId)) continue;

    const quantity = typeof qty === 'number' ? Math.trunc(qty) : Number.NaN;
    if (!Number.isFinite(quantity) || quantity < 1) continue;

    byProduct.set(productId, (byProduct.get(productId) ?? 0) + quantity);
  }

  return [...byProduct.entries()]
    .map(([productId, qty]) => ({ productId, qty: Math.min(qty, MAX_QTY_PER_LINE) }))
    // Cap the number of distinct lines so a hostile body cannot force a huge IN query.
    .slice(0, MAX_CART_LINES);
}

/**
 * Combine a guest cart with an existing server cart.
 *
 * Quantities are summed rather than overwritten. Overwriting would silently discard whichever
 * basket the shopper did not touch most recently, and they have no way to know which that was.
 * Summing is then capped per line, so "6 + 6" becomes the maximum rather than 12.
 */
export function mergeCarts(serverLines: CartLine[], guestLines: CartLine[]): CartLine[] {
  const combined = new Map<string, number>();

  for (const line of serverLines) {
    combined.set(line.productId, line.qty);
  }
  for (const line of guestLines) {
    combined.set(line.productId, (combined.get(line.productId) ?? 0) + line.qty);
  }

  return [...combined.entries()]
    .map(([productId, qty]) => ({ productId, qty: Math.min(qty, MAX_QTY_PER_LINE) }))
    .slice(0, MAX_CART_LINES);
}

export type ClampResult = {
  qty: number;
  /** The originally requested quantity, when it had to be reduced. */
  clampedFrom: number | null;
};

/**
 * Reduce a quantity to what is actually purchasable.
 *
 * Returning the original alongside the clamped value is what lets the UI say "only 3 left, we
 * reduced your quantity" instead of silently changing the number under the shopper's cursor —
 * which reads as a bug and loses their trust in the total.
 */
export function clampToStock(requested: number, stock: number): ClampResult {
  const ceiling = Math.min(stock, MAX_QTY_PER_LINE);

  if (ceiling <= 0) return { qty: 0, clampedFrom: requested };
  if (requested <= ceiling) return { qty: requested, clampedFrom: null };
  return { qty: ceiling, clampedFrom: requested };
}
