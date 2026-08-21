import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CartContents } from '@/components/cart/CartContents';
import { useCartStore } from '@/lib/cart/store';
import { FREE_SHIPPING_THRESHOLD_CENTS } from '@/lib/money';
import type { CartLineView, CartView } from '@/lib/cart/types';

/**
 * The cart page is where a shopper decides whether to trust the numbers, so the tests here are
 * largely about what happens when the server's view disagrees with what they thought they had:
 * a line that went out of stock, a quantity that had to be reduced, a product that stopped being
 * sold. The component's contract is that none of that happens silently.
 *
 * `next/image` is mocked to a plain `img`. It is not what is under test, and its real
 * implementation brings a loader and layout behaviour that jsdom cannot evaluate anyway.
 */

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

function makeLine(overrides: Partial<CartLineView> = {}): CartLineView {
  return {
    productId: 'p1',
    slug: 'kestrel-ultra-webcam',
    title: 'Kestrel Ultra Webcam',
    brand: 'Kestrel',
    image: 'electronics-0',
    unitCents: 129_900,
    currency: 'INR',
    qty: 1,
    lineCents: 129_900,
    stock: 5,
    clampedFrom: null,
    ...overrides,
  };
}

/** A view with subtotal and item count derived, the way the server computes them. */
function makeView(lines: CartLineView[], overrides: Partial<CartView> = {}): CartView {
  return {
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.qty, 0),
    subtotalCents: lines.reduce((sum, line) => sum + line.lineCents, 0),
    currency: 'INR',
    removedCount: 0,
    ...overrides,
  };
}

function setup(state: Partial<ReturnType<typeof useCartStore.getState>> = {}) {
  const setQty = vi.fn(async () => {});
  const removeItem = vi.fn(async () => {});

  useCartStore.setState({ isLoading: false, error: null, setQty, removeItem, ...state });
  render(<CartContents />);

  return { setQty, removeItem, user: userEvent.setup() };
}

describe('CartContents', () => {
  describe('before the cart has resolved', () => {
    it('shows a skeleton rather than an empty cart', () => {
      setup({ isLoading: true, view: null });

      // The distinction matters: "your cart is empty" while the first resolve is still in flight
      // tells the shopper their basket is gone.
      expect(screen.queryByText('Your cart is empty')).not.toBeInTheDocument();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });
  });

  describe('empty cart', () => {
    it('offers a way out', () => {
      setup({ view: makeView([]) });

      expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Browse the catalog' })).toHaveAttribute('href', '/');
    });
  });

  describe('a normal line', () => {
    it('shows brand, title, unit price and line total', () => {
      setup({ view: makeView([makeLine({ qty: 2, lineCents: 259_800 })]) });

      expect(screen.getByRole('link', { name: 'Kestrel Ultra Webcam' })).toHaveAttribute(
        'href',
        '/p/kestrel-ultra-webcam',
      );

      // Scoped to the list, because a single-line cart's line total and its subtotal are the same
      // number — an unscoped query would match both and it would not be clear which one broke.
      const row = within(screen.getByRole('list'));
      expect(row.getByText('Kestrel')).toBeInTheDocument();
      expect(row.getByText('₹1,299')).toBeInTheDocument();
      expect(row.getByText('₹2,598')).toBeInTheDocument();
    });

    it('sends a quantity change to the store against the right product', async () => {
      const { user, setQty } = setup({
        view: makeView([makeLine({ productId: 'webcam-1', qty: 2, lineCents: 259_800 })]),
      });

      await user.click(
        screen.getByRole('button', { name: 'Increase quantity of Kestrel Ultra Webcam' }),
      );

      expect(setQty).toHaveBeenCalledWith('webcam-1', 3);
    });

    it('removes a line, naming it for assistive tech', async () => {
      const { user, removeItem } = setup({
        view: makeView([makeLine({ productId: 'webcam-1' })]),
      });

      /*
       * "Remove" alone would be ambiguous in a cart with several rows, so the button carries the
       * product name in an sr-only span.
       *
       * The optional space in this pattern is not sloppiness. The visible word and the sr-only
       * text are separate nodes, and `dom-accessibility-api` — what Testing Library computes
       * accessible names with — trims each node before joining them, so the space between them
       * disappears here and the computed name is "RemoveKestrel Ultra Webcam…". Browsers use
       * rendered text and keep it. Matching either way asserts the property that matters (the
       * button names its product) without pinning the test to one implementation's quirk.
       */
      await user.click(
        screen.getByRole('button', { name: /^Remove ?Kestrel Ultra Webcam from your cart$/ }),
      );

      expect(removeItem).toHaveBeenCalledWith('webcam-1');
    });

    it('caps the stepper at available stock', () => {
      setup({ view: makeView([makeLine({ qty: 2, stock: 2, lineCents: 259_800 })]) });

      expect(
        screen.getByRole('button', { name: 'Increase quantity of Kestrel Ultra Webcam' }),
      ).toBeDisabled();
    });
  });

  describe('a line that went out of stock', () => {
    const soldOut = makeLine({
      productId: 'gone',
      title: 'Meridian Noise-Cancelling Headphones',
      qty: 0,
      lineCents: 0,
      stock: 0,
    });

    it('stays visible and says so, rather than disappearing', () => {
      setup({ view: makeView([makeLine(), soldOut]) });

      // Silently dropping the row reads as a bug and costs trust in the total.
      expect(screen.getByText('Meridian Noise-Cancelling Headphones')).toBeInTheDocument();
      expect(screen.getByText('Out of stock')).toBeInTheDocument();
    });

    it('offers no quantity control for it', () => {
      setup({ view: makeView([makeLine(), soldOut]) });

      expect(
        screen.queryByRole('button', {
          name: 'Increase quantity of Meridian Noise-Cancelling Headphones',
        }),
      ).not.toBeInTheDocument();
      // The purchasable line still has one.
      expect(
        screen.getByRole('button', { name: 'Increase quantity of Kestrel Ultra Webcam' }),
      ).toBeInTheDocument();
    });

    it('explains that it is excluded from the total', () => {
      setup({ view: makeView([makeLine(), soldOut]) });

      expect(
        screen.getByText('Out-of-stock items are not included in your total and will not be ordered.'),
      ).toBeInTheDocument();
    });

    it('blocks checkout when nothing in the cart can be bought', () => {
      setup({ view: makeView([soldOut]) });

      expect(screen.getByRole('button', { name: 'Nothing available to order' })).toBeDisabled();
      expect(screen.queryByRole('link', { name: 'Proceed to checkout' })).not.toBeInTheDocument();
    });

    it('still allows checkout when something else is purchasable', () => {
      setup({ view: makeView([makeLine(), soldOut]) });

      expect(screen.getByRole('link', { name: 'Proceed to checkout' })).toHaveAttribute(
        'href',
        '/checkout',
      );
    });
  });

  describe('a quantity that had to be reduced', () => {
    it('says what changed and why', () => {
      setup({
        view: makeView([makeLine({ qty: 2, stock: 2, clampedFrom: 5, lineCents: 259_800 })]),
      });

      // Naming the old quantity is the point — the shopper asked for 5 and is getting 2.
      expect(screen.getByText('Only 2 left — quantity reduced from 5.')).toBeInTheDocument();
    });
  });

  describe('products that no longer exist', () => {
    it('accounts for a single removed line', () => {
      setup({ view: makeView([makeLine()], { removedCount: 1 }) });

      expect(
        screen.getByText('An item was removed because it is no longer sold.'),
      ).toBeInTheDocument();
    });

    it('accounts for several', () => {
      setup({ view: makeView([makeLine()], { removedCount: 3 }) });

      expect(
        screen.getByText('3 items were removed because they are no longer sold.'),
      ).toBeInTheDocument();
    });
  });

  describe('summary', () => {
    it('counts units rather than lines', () => {
      setup({ view: makeView([makeLine({ qty: 3, lineCents: 389_700 })]) });

      // "3 items" for three of one product is what a shopper means by items.
      expect(screen.getByText('Subtotal (3 items)')).toBeInTheDocument();
    });

    it('uses the singular for one', () => {
      setup({ view: makeView([makeLine()]) });

      expect(screen.getByText('Subtotal (1 item)')).toBeInTheDocument();
    });

    it('charges standard delivery below the threshold and says what is missing', () => {
      const under = FREE_SHIPPING_THRESHOLD_CENTS - 30_000;
      setup({ view: makeView([makeLine({ unitCents: under, lineCents: under })]) });

      expect(screen.getByText('₹49')).toBeInTheDocument();
      expect(screen.getByText('Add ₹300 more for free delivery.')).toBeInTheDocument();
    });

    it('gives free delivery at the threshold, with nothing left to add', () => {
      setup({
        view: makeView([
          makeLine({
            unitCents: FREE_SHIPPING_THRESHOLD_CENTS,
            lineCents: FREE_SHIPPING_THRESHOLD_CENTS,
          }),
        ]),
      });

      // At exactly the threshold, not above it — an off-by-one here charges ₹49 to the shopper who
      // added an item specifically to avoid it.
      expect(screen.getByText('Free')).toBeInTheDocument();
      expect(screen.queryByText(/more for free delivery/)).not.toBeInTheDocument();
    });

    it('announces the running total for screen readers', () => {
      setup({ view: makeView([makeLine({ qty: 2, lineCents: 259_800 })]) });

      // Quantity edits change the total without moving focus, so the live region is the only way a
      // screen reader user learns it changed.
      expect(screen.getByText('Subtotal ₹2,598, 2 items')).toBeInTheDocument();
    });
  });

  describe('a failed update', () => {
    it('surfaces the store error as an alert', () => {
      setup({ view: makeView([makeLine()]), error: 'Could not update your cart.' });

      expect(screen.getByRole('alert')).toHaveTextContent('Could not update your cart.');
      // The cart stays usable — the error is not a dead end.
      expect(screen.getByRole('link', { name: 'Proceed to checkout' })).toBeInTheDocument();
    });
  });
});
