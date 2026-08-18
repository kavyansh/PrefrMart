/**
 * Cart shapes shared by client and server.
 *
 * The important distinction: a `CartLine` is what the *client* stores — a product id and a
 * quantity, nothing more. Prices, titles and stock always come from the server when the cart is
 * rendered. Persisting a price on the client and trusting it later is how a shopper ends up
 * checking out at yesterday's price, or a price they typed themselves.
 */

export type CartLine = {
  productId: string;
  qty: number;
};

/** A line resolved against current product data, ready to display. */
export type CartLineView = {
  productId: string;
  slug: string;
  title: string;
  brand: string;
  image: string;
  /** Current price, from the database — never from the client. */
  unitCents: number;
  currency: string;
  qty: number;
  lineCents: number;
  /** Current stock, for the stepper's ceiling and the out-of-stock notice. */
  stock: number;
  /** True when the requested quantity had to be reduced to what is available. */
  clampedFrom: number | null;
};

export type CartView = {
  lines: CartLineView[];
  /** Total units, which is what "3 items" should mean to a shopper. */
  itemCount: number;
  subtotalCents: number;
  currency: string;
  /** Lines dropped because the product no longer exists. */
  removedCount: number;
};

export const MAX_QTY_PER_LINE = 10;
export const MAX_CART_LINES = 50;
