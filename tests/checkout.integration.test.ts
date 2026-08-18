/**
 * Cart and checkout, end to end against a real server and database.
 *
 * The tests that matter here are the ones about money and stock. A broken cart UI is visible; an
 * order that decremented stock without recording an order, or a shopper who talked the server into
 * a total they chose, is not — and both are the kind of thing a unit test on pure functions cannot
 * see, because the guarantee lives in a transaction.
 *
 * These write real rows, so each cleans up in `afterAll` and stock is restored.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type TestServer } from './helpers/server';
import { testDb } from './helpers/db';
import { loginAs } from './helpers/auth';

let server: TestServer;
let baseUrl: string;

/** idempotencyKeys created here, so the orders can be removed afterwards. */
const createdKeys: string[] = [];
/** Stock adjustments to undo: productId -> units to add back. */
const stockToRestore = new Map<string, number>();

const login = (email: string) => loginAs(baseUrl, email);

function authed(cookie: string, body: unknown, method = 'POST'): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  };
}

async function setCart(cookie: string, lines: Array<{ productId: string; qty: number }>) {
  const response = await fetch(`${baseUrl}/api/cart`, authed(cookie, { lines }, 'PUT'));
  expect(response.status).toBe(200);
  return (await response.json()) as {
    lines: Array<{ productId: string; qty: number; unitCents: number; clampedFrom: number | null; stock: number }>;
    itemCount: number;
    subtotalCents: number;
  };
}

async function inStockProducts(count: number, minStock = 5) {
  const products = await testDb.product.findMany({
    where: { stock: { gte: minStock } },
    take: count,
    select: { id: true, priceCents: true, stock: true, title: true },
  });
  expect(products.length).toBe(count);
  return products;
}

const ADDRESS = {
  fullName: 'Test Buyer',
  line1: '1 Verification Road',
  city: 'Pune',
  state: 'Maharashtra',
  postalCode: '411001',
  country: 'IN',
  phone: '+919812345678',
};

beforeAll(async () => {
  server = await startServer();
  baseUrl = server.baseUrl;
}, 120_000);

afterAll(async () => {
  // Orders first: OrderItem rows cascade from them.
  if (createdKeys.length > 0) {
    const orders = await testDb.order.findMany({
      where: { idempotencyKey: { in: createdKeys } },
      select: { id: true },
    });
    const ids = orders.map((order) => order.id);
    if (ids.length > 0) {
      await testDb.orderItem.deleteMany({ where: { orderId: { in: ids } } });
      await testDb.order.deleteMany({ where: { id: { in: ids } } });
    }
  }

  for (const [productId, units] of stockToRestore) {
    await testDb.product.update({ where: { id: productId }, data: { stock: { increment: units } } });
  }

  // Addresses created by the new-address path.
  await testDb.address.deleteMany({ where: { line1: ADDRESS.line1 } });

  await testDb.$disconnect();
  await server?.stop();
});

describe('cart pricing authority', () => {
  it('ignores any price the client sends', async () => {
    /*
     * The guest cart lives in IndexedDB, which nothing on the server can vouch for. So the client
     * gets to say *what* and *how many*, and the server decides the price. A client that could
     * name a price could name its own total.
     */
    const [product] = await inStockProducts(1);

    const response = await fetch(`${baseUrl}/api/cart/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: [{ productId: product!.id, qty: 1, unitCents: 1, lineCents: 1, subtotalCents: 1 }],
      }),
    });

    expect(response.status).toBe(200);
    const view = (await response.json()) as { lines: Array<{ unitCents: number }>; subtotalCents: number };
    expect(view.lines[0]!.unitCents).toBe(product!.priceCents);
    expect(view.subtotalCents).toBe(product!.priceCents);
  });

  it('resolves a guest cart without a session', async () => {
    const [product] = await inStockProducts(1);
    const response = await fetch(`${baseUrl}/api/cart/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: [{ productId: product!.id, qty: 2 }] }),
    });
    expect(response.status).toBe(200);
    const view = (await response.json()) as { itemCount: number };
    expect(view.itemCount).toBe(2);
  });

  it('drops a line whose product no longer exists, and says how many', async () => {
    const response = await fetch(`${baseUrl}/api/cart/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: [{ productId: 'clxq000000000000000000zz', qty: 1 }] }),
    });
    const view = (await response.json()) as { lines: unknown[]; removedCount: number };
    expect(view.lines).toEqual([]);
    // Counted rather than silently swallowed, so the cart page can explain the gap.
    expect(view.removedCount).toBe(1);
  });

  it('rejects malformed lines', async () => {
    for (const lines of [
      [{ productId: 'clxq0000000000000000000a', qty: 0 }],
      [{ productId: 'clxq0000000000000000000a', qty: -1 }],
      [{ productId: 'clxq0000000000000000000a', qty: 9999 }],
      [{ productId: '../../etc/passwd', qty: 1 }],
    ]) {
      const response = await fetch(`${baseUrl}/api/cart/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lines }),
      });
      expect(response.status, JSON.stringify(lines)).toBe(400);
    }
  });
});

describe('stock clamping', () => {
  it('reduces the quantity and reports what was asked for', async () => {
    /*
     * Regression guard. This originally clamped correctly but reported `clampedFrom: null`, because
     * the server clamped the lines, then resolved the already-clamped values — so the UI silently
     * showed 4 where the shopper asked for 9. Reporting the original is the whole point.
     */
    const product = await testDb.product.findFirst({
      where: { stock: { gt: 1, lte: 5 } },
      select: { id: true, stock: true },
    });
    expect(product, 'need a low-stock product').not.toBeNull();

    const cookie = await login('dan@example.com');
    const view = await setCart(cookie, [{ productId: product!.id, qty: 9 }]);

    expect(view.lines[0]!.qty).toBe(product!.stock);
    expect(view.lines[0]!.clampedFrom).toBe(9);
  });

  it('does not report a clamp when the quantity fits', async () => {
    const [product] = await inStockProducts(1, 20);
    const cookie = await login('dan@example.com');
    const view = await setCart(cookie, [{ productId: product!.id, qty: 2 }]);

    expect(view.lines[0]!.qty).toBe(2);
    expect(view.lines[0]!.clampedFrom).toBeNull();
  });
});

describe('cart merge on sign-in', () => {
  it('sums quantities instead of replacing either basket', async () => {
    const [a, b, c] = await inStockProducts(3, 20);
    const cookie = await login('ravi@example.com');

    await setCart(cookie, [
      { productId: a!.id, qty: 2 },
      { productId: b!.id, qty: 1 },
    ]);

    const response = await fetch(
      `${baseUrl}/api/cart/merge`,
      authed(cookie, { lines: [{ productId: a!.id, qty: 3 }, { productId: c!.id, qty: 4 }] }),
    );
    expect(response.status).toBe(200);

    const view = (await response.json()) as {
      lines: Array<{ productId: string; qty: number }>;
      itemCount: number;
    };
    const byId = new Map(view.lines.map((line) => [line.productId, line.qty]));

    // 2 + 3, not overwritten to 3.
    expect(byId.get(a!.id)).toBe(5);
    expect(byId.get(b!.id)).toBe(1);
    expect(byId.get(c!.id)).toBe(4);
    expect(view.itemCount).toBe(10);
  });

  it('requires a session', async () => {
    const response = await fetch(`${baseUrl}/api/cart/merge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: [] }),
    });
    expect(response.status).toBe(401);
  });
});

describe('placing an order', () => {
  it('computes totals server-side and ignores any the client sends', async () => {
    const [product] = await inStockProducts(1, 20);
    const cookie = await login('dan@example.com');
    await setCart(cookie, [{ productId: product!.id, qty: 2 }]);

    const key = `srv-totals-${Date.now()}`;
    createdKeys.push(key);

    const response = await fetch(
      `${baseUrl}/api/orders`,
      authed(cookie, {
        idempotencyKey: key,
        deliveryOption: 'standard',
        address: ADDRESS,
        paymentLabel: 'Visa ending 4242',
        // All of this must be ignored — the server has its own cart and its own arithmetic.
        totalCents: 1,
        subtotalCents: 1,
        lines: [{ unitCents: 1, qty: 1 }],
      }),
    );

    expect(response.status).toBe(201);
    stockToRestore.set(product!.id, (stockToRestore.get(product!.id) ?? 0) + 2);

    const order = await testDb.order.findUnique({
      where: { idempotencyKey: key },
      select: { subtotalCents: true, totalCents: true, taxCents: true, items: true },
    });

    expect(order!.subtotalCents).toBe(product!.priceCents * 2);
    expect(order!.totalCents).toBeGreaterThan(order!.subtotalCents);
    // The snapshotted unit price is the real one, not the client's.
    expect(order!.items[0]!.unitCents).toBe(product!.priceCents);
  });

  it('decrements stock by exactly the quantity ordered', async () => {
    const [product] = await inStockProducts(1, 20);
    const before = product!.stock;

    const cookie = await login('dan@example.com');
    await setCart(cookie, [{ productId: product!.id, qty: 3 }]);

    const key = `stock-${Date.now()}`;
    createdKeys.push(key);

    const response = await fetch(
      `${baseUrl}/api/orders`,
      authed(cookie, {
        idempotencyKey: key,
        deliveryOption: 'standard',
        address: ADDRESS,
        paymentLabel: 'Visa ending 4242',
      }),
    );
    expect(response.status).toBe(201);
    stockToRestore.set(product!.id, (stockToRestore.get(product!.id) ?? 0) + 3);

    const after = await testDb.product.findUnique({
      where: { id: product!.id },
      select: { stock: true },
    });
    expect(after!.stock).toBe(before - 3);
  });

  it('empties the cart in the same operation', async () => {
    const [product] = await inStockProducts(1, 20);
    const cookie = await login('meera@example.com');
    await setCart(cookie, [{ productId: product!.id, qty: 1 }]);

    const key = `clears-${Date.now()}`;
    createdKeys.push(key);

    await fetch(
      `${baseUrl}/api/orders`,
      authed(cookie, {
        idempotencyKey: key,
        deliveryOption: 'standard',
        address: ADDRESS,
        paymentLabel: 'Visa ending 4242',
      }),
    );
    stockToRestore.set(product!.id, (stockToRestore.get(product!.id) ?? 0) + 1);

    const cart = await fetch(`${baseUrl}/api/cart`, { headers: { cookie } });
    const view = (await cart.json()) as { lines: unknown[]; itemCount: number };
    expect(view.lines).toEqual([]);
    expect(view.itemCount).toBe(0);
  });

  it('creates one order for a double-submitted checkout', async () => {
    /*
     * The guarantee behind the disabled button. A shopper who double-taps, or whose connection
     * drops after the request left the browser, must end up with one order — and must be shown
     * that order rather than an error.
     */
    const [product] = await inStockProducts(1, 20);
    const before = product!.stock;

    const cookie = await login('asha@example.com');
    await setCart(cookie, [{ productId: product!.id, qty: 2 }]);

    const key = `idem-${Date.now()}`;
    createdKeys.push(key);
    const body = {
      idempotencyKey: key,
      deliveryOption: 'express',
      address: ADDRESS,
      paymentLabel: 'Visa ending 4242',
    };

    const first = await fetch(`${baseUrl}/api/orders`, authed(cookie, body));
    const second = await fetch(`${baseUrl}/api/orders`, authed(cookie, body));

    expect(first.status).toBe(201);
    // 200, not 201: the second request created nothing.
    expect(second.status).toBe(200);

    const a = (await first.json()) as { orderId: string; reused: boolean };
    const b = (await second.json()) as { orderId: string; reused: boolean };

    expect(a.orderId).toBe(b.orderId);
    expect(a.reused).toBe(false);
    expect(b.reused).toBe(true);

    expect(await testDb.order.count({ where: { idempotencyKey: key } })).toBe(1);

    // And stock moved once, not twice.
    const after = await testDb.product.findUnique({
      where: { id: product!.id },
      select: { stock: true },
    });
    expect(after!.stock).toBe(before - 2);
    stockToRestore.set(product!.id, (stockToRestore.get(product!.id) ?? 0) + 2);
  });

  it('survives two truly concurrent submissions', async () => {
    // Sent together, so both can pass the pre-check and race on the unique constraint.
    const [product] = await inStockProducts(1, 20);
    const before = product!.stock;

    const cookie = await login('asha@example.com');
    await setCart(cookie, [{ productId: product!.id, qty: 1 }]);

    const key = `race-${Date.now()}`;
    createdKeys.push(key);
    const body = {
      idempotencyKey: key,
      deliveryOption: 'standard',
      address: ADDRESS,
      paymentLabel: 'Visa ending 4242',
    };

    const [first, second] = await Promise.all([
      fetch(`${baseUrl}/api/orders`, authed(cookie, body)),
      fetch(`${baseUrl}/api/orders`, authed(cookie, body)),
    ]);

    // Exactly one order, whichever request won.
    expect(await testDb.order.count({ where: { idempotencyKey: key } })).toBe(1);
    expect([first.status, second.status].filter((status) => status === 201)).toHaveLength(1);

    const after = await testDb.product.findUnique({
      where: { id: product!.id },
      select: { stock: true },
    });
    expect(after!.stock).toBe(before - 1);
    stockToRestore.set(product!.id, (stockToRestore.get(product!.id) ?? 0) + 1);
  });

  it('refuses an order for more than the remaining stock, and changes nothing', async () => {
    const product = await testDb.product.findFirst({
      where: { stock: { gt: 1, lte: 4 } },
      select: { id: true, stock: true },
    });
    const cookie = await login('dan@example.com');

    // The cart clamps, so bypass it: write the over-quantity straight to the cart row.
    await setCart(cookie, [{ productId: product!.id, qty: 1 }]);
    const cart = await testDb.cart.findFirst({
      where: { user: { email: 'dan@example.com' }, status: 'open' },
      select: { id: true },
    });
    await testDb.cartItem.updateMany({
      where: { cartId: cart!.id, productId: product!.id },
      data: { qty: product!.stock + 5 },
    });

    const key = `oversell-${Date.now()}`;
    const response = await fetch(
      `${baseUrl}/api/orders`,
      authed(cookie, {
        idempotencyKey: key,
        deliveryOption: 'standard',
        address: ADDRESS,
        paymentLabel: 'Visa ending 4242',
      }),
    );

    expect(response.status).toBe(409);

    // Nothing partially applied: no order, and stock untouched.
    expect(await testDb.order.count({ where: { idempotencyKey: key } })).toBe(0);
    const after = await testDb.product.findUnique({
      where: { id: product!.id },
      select: { stock: true },
    });
    expect(after!.stock).toBe(product!.stock);
  });

  it('refuses an empty cart', async () => {
    const cookie = await login('sofia@example.com');
    await setCart(cookie, []);

    const response = await fetch(
      `${baseUrl}/api/orders`,
      authed(cookie, {
        idempotencyKey: `empty-${Date.now()}`,
        deliveryOption: 'standard',
        address: ADDRESS,
        paymentLabel: 'Visa ending 4242',
      }),
    );
    expect(response.status).toBe(409);
  });

  it('requires a session', async () => {
    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: `anon-${Date.now()}`,
        deliveryOption: 'standard',
        address: ADDRESS,
        paymentLabel: 'Visa ending 4242',
      }),
    });
    expect(response.status).toBe(401);
  });

  it('rejects a cross-site submission', async () => {
    const cookie = await login('dan@example.com');
    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, 'sec-fetch-site': 'cross-site' },
      body: JSON.stringify({
        idempotencyKey: `xsite-${Date.now()}`,
        deliveryOption: 'standard',
        address: ADDRESS,
        paymentLabel: 'Visa ending 4242',
      }),
    });
    expect(response.status).toBe(403);
  });
});

describe('address handling', () => {
  it('refuses another user’s saved address', async () => {
    /*
     * Without the userId scope on the address lookup, one shopper could have goods delivered to
     * another's home simply by pasting an id.
     */
    const asha = await testDb.user.findUnique({
      where: { email: 'asha@example.com' },
      select: { addresses: { select: { id: true }, take: 1 } },
    });
    const foreignAddressId = asha!.addresses[0]!.id;

    const [product] = await inStockProducts(1, 20);
    const cookie = await login('sofia@example.com');
    await setCart(cookie, [{ productId: product!.id, qty: 1 }]);

    const key = `foreign-addr-${Date.now()}`;
    const response = await fetch(
      `${baseUrl}/api/orders`,
      authed(cookie, {
        idempotencyKey: key,
        deliveryOption: 'standard',
        addressId: foreignAddressId,
        paymentLabel: 'Visa ending 4242',
      }),
    );

    expect(response.status).toBe(400);
    expect(await testDb.order.count({ where: { idempotencyKey: key } })).toBe(0);
  });

  it('requires exactly one address source', async () => {
    const [product] = await inStockProducts(1, 20);
    const cookie = await login('dan@example.com');
    await setCart(cookie, [{ productId: product!.id, qty: 1 }]);

    // Neither.
    const neither = await fetch(
      `${baseUrl}/api/orders`,
      authed(cookie, {
        idempotencyKey: `neither-${Date.now()}`,
        deliveryOption: 'standard',
        paymentLabel: 'Visa ending 4242',
      }),
    );
    expect(neither.status).toBe(400);

    // Both — which one wins should not be an accident of implementation order.
    const both = await fetch(
      `${baseUrl}/api/orders`,
      authed(cookie, {
        idempotencyKey: `both-${Date.now()}`,
        deliveryOption: 'standard',
        addressId: 'clxq000000000000000000aa',
        address: ADDRESS,
        paymentLabel: 'Visa ending 4242',
      }),
    );
    expect(both.status).toBe(400);
  });
});

describe('order visibility after checkout', () => {
  it('shows the new order in the buyer’s history and nowhere else', async () => {
    const [product] = await inStockProducts(1, 20);
    const cookie = await login('meera@example.com');
    await setCart(cookie, [{ productId: product!.id, qty: 1 }]);

    const key = `visible-${Date.now()}`;
    createdKeys.push(key);

    const placed = await fetch(
      `${baseUrl}/api/orders`,
      authed(cookie, {
        idempotencyKey: key,
        deliveryOption: 'standard',
        address: ADDRESS,
        paymentLabel: 'Visa ending 4242',
      }),
    );
    expect(placed.status).toBe(201);
    stockToRestore.set(product!.id, (stockToRestore.get(product!.id) ?? 0) + 1);

    const { orderId } = (await placed.json()) as { orderId: string };

    const own = await fetch(`${baseUrl}/api/account/orders`, { headers: { cookie } });
    const history = (await own.json()) as { items: Array<{ id: string }> };
    expect(history.items.some((order) => order.id === orderId)).toBe(true);

    // And is invisible to someone else.
    const otherCookie = await login('ravi@example.com');
    const other = await fetch(`${baseUrl}/api/account/orders`, { headers: { cookie: otherCookie } });
    const otherHistory = (await other.json()) as { items: Array<{ id: string }> };
    expect(otherHistory.items.some((order) => order.id === orderId)).toBe(false);
  });
});
