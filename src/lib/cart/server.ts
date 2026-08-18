import { db } from '@/lib/db';
import { clampToStock, mergeCarts } from '@/lib/cart/merge';
import { DEFAULT_CURRENCY } from '@/lib/money';
import type { CartLine, CartView, CartLineView } from '@/lib/cart/types';

/**
 * Server-side cart: resolving lines against live product data, and persisting the signed-in
 * user's cart.
 *
 * `resolveLines` is the single place a cart becomes displayable, and it is used for both guests
 * and signed-in users. That matters: prices, titles and stock come from the database on every
 * render, so a client that tampers with its stored cart can change *what* it is buying and *how
 * many*, but never *at what price*.
 */

function firstImage(imageKeys: string): string {
  try {
    const parsed = JSON.parse(imageKeys) as unknown;
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0];
  } catch {
    // A malformed row should render a placeholder, not break the cart.
  }
  return '';
}

/**
 * Turn `{ productId, qty }` lines into a displayable cart.
 *
 * Lines whose product no longer exists are dropped and counted, so the UI can say so rather than
 * showing a blank row or crashing on a missing lookup. Quantities are clamped to stock here too,
 * which means the cart page cannot show a total the shopper is unable to actually buy.
 */
export async function resolveLines(lines: CartLine[]): Promise<CartView> {
  if (lines.length === 0) {
    return { lines: [], itemCount: 0, subtotalCents: 0, currency: DEFAULT_CURRENCY, removedCount: 0 };
  }

  const products = await db.product.findMany({
    where: { id: { in: lines.map((line) => line.productId) } },
    select: {
      id: true,
      slug: true,
      title: true,
      brand: true,
      priceCents: true,
      currency: true,
      stock: true,
      imageKeys: true,
    },
  });

  const byId = new Map(products.map((product) => [product.id, product]));

  const resolved: CartLineView[] = [];
  let removedCount = 0;

  // Iterate the incoming lines, not the query result, so the shopper's ordering is preserved.
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (product === undefined) {
      removedCount++;
      continue;
    }

    const { qty, clampedFrom } = clampToStock(line.qty, product.stock);

    resolved.push({
      productId: product.id,
      slug: product.slug,
      title: product.title,
      brand: product.brand,
      image: product.imageKeys ? firstImage(product.imageKeys) : '',
      unitCents: product.priceCents,
      currency: product.currency,
      qty,
      lineCents: product.priceCents * qty,
      stock: product.stock,
      clampedFrom,
    });
  }

  return {
    lines: resolved,
    itemCount: resolved.reduce((sum, line) => sum + line.qty, 0),
    // Out-of-stock lines carry qty 0, so they contribute nothing to the total while staying
    // visible — the shopper needs to see what they cannot have.
    subtotalCents: resolved.reduce((sum, line) => sum + line.lineCents, 0),
    currency: resolved[0]?.currency ?? DEFAULT_CURRENCY,
    removedCount,
  };
}

/** The user's open cart, creating one lazily on first write rather than on every read. */
async function findOpenCart(userId: string) {
  return db.cart.findFirst({
    where: { userId, status: 'open' },
    select: { id: true, items: { select: { productId: true, qty: true } } },
  });
}

export async function getServerCartLines(userId: string): Promise<CartLine[]> {
  const cart = await findOpenCart(userId);
  return cart?.items.map((item) => ({ productId: item.productId, qty: item.qty })) ?? [];
}

export async function getServerCart(userId: string): Promise<CartView> {
  return resolveLines(await getServerCartLines(userId));
}

/**
 * Replace the user's cart with exactly these lines.
 *
 * Replace rather than patch: the client always sends its complete line set, which makes the
 * operation idempotent and removes a whole class of "the quantity is wrong because two updates
 * raced" bugs. A cart is a handful of rows, so rewriting it is cheap.
 *
 * Unknown product ids are filtered out inside the transaction — a stale client could otherwise
 * make this fail on a foreign key long after the product was deleted.
 */
export async function replaceServerCart(userId: string, lines: CartLine[]): Promise<CartView> {
  const known =
    lines.length === 0
      ? []
      : await db.product.findMany({
          where: { id: { in: lines.map((line) => line.productId) } },
          select: { id: true, stock: true },
        });

  const stockById = new Map(known.map((product) => [product.id, product.stock]));

  const persistable = lines
    .filter((line) => stockById.has(line.productId))
    .map((line) => ({
      productId: line.productId,
      qty: clampToStock(line.qty, stockById.get(line.productId) ?? 0).qty,
    }))
    // A zero-quantity line is not a cart entry; an out-of-stock item is simply not in the cart.
    .filter((line) => line.qty > 0);

  await db.$transaction(async (tx) => {
    const existing = await tx.cart.findFirst({
      where: { userId, status: 'open' },
      select: { id: true },
    });

    const cartId =
      existing?.id ??
      (await tx.cart.create({ data: { userId }, select: { id: true } })).id;

    await tx.cartItem.deleteMany({ where: { cartId } });

    if (persistable.length > 0) {
      await tx.cartItem.createMany({
        data: persistable.map((line) => ({ cartId, ...line })),
      });
    }

    // Touch the cart so `updatedAt` reflects the change.
    await tx.cart.update({ where: { id: cartId }, data: { status: 'open' } });
  });

  /*
   * Resolve the *requested* lines, not what was persisted.
   *
   * Both are clamped to stock, so the quantities agree — but resolving the already-clamped values
   * makes `clampedFrom` come back null, and the UI then silently shows 3 where the shopper asked
   * for 9. Passing the original request is what lets it say "only 3 left, reduced from 9".
   * `resolveLines` also reports lines dropped for missing products, which `persistable` has
   * already filtered out.
   */
  return resolveLines(lines);
}

/**
 * Merge a guest cart into the signed-in user's cart.
 *
 * Called once, immediately after signing in. Summing rather than replacing is what stops a
 * shopper losing whichever basket they did not touch most recently — see `mergeCarts`.
 */
export async function mergeGuestCart(userId: string, guestLines: CartLine[]): Promise<CartView> {
  const serverLines = await getServerCartLines(userId);
  return replaceServerCart(userId, mergeCarts(serverLines, guestLines));
}

export async function clearServerCart(userId: string): Promise<void> {
  await replaceServerCart(userId, []);
}
