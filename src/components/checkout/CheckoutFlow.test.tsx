import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckoutFlow, type SavedAddress } from '@/components/checkout/CheckoutFlow';
import { useCartStore } from '@/lib/cart/store';
import { computeTotals, formatMoney } from '@/lib/money';
import type { CartLineView, CartView } from '@/lib/cart/types';

/**
 * The flow that turns a cart into an order, which makes it the one place in the app where a bug
 * costs money in both directions: a lost order, or two charges for one basket.
 *
 * Three properties are worth the setup cost of driving four steps:
 *
 *  1. One idempotency key per mounted flow, not per submit. This is what makes a retry safe, and it
 *     is a `useMemo` with an empty dependency array — one stray dependency turns it into a key per
 *     render and every retry becomes a second order.
 *  2. A thrown fetch queues the order; a 4xx does not. The asymmetry is deliberate: a request that
 *     never arrived is worth replaying, and a rejection would just be replayed into the same
 *     rejection forever.
 *  3. Totals come from `computeTotals`, the same function the order API uses. A second
 *     implementation here would drift.
 */

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace,
    push: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

// The offline queue writes to IndexedDB, which jsdom does not provide. What matters here is *what*
// gets handed to it, not that it persisted.
const enqueueOrder = vi.fn<(key: string, payload: unknown) => Promise<void>>();
vi.mock('@/lib/orders/queue', () => ({
  // Wrapped rather than passed directly: the factory runs before this module's body, so it has to
  // reach the spy lazily.
  enqueueOrder: (key: string, payload: unknown) => enqueueOrder(key, payload),
}));

const SAVED_ADDRESS: SavedAddress = {
  id: 'addr-home',
  fullName: 'Ada Lovelace',
  line1: '12 Marlborough Place',
  line2: null,
  city: 'Bengaluru',
  state: 'KA',
  postalCode: '560001',
  country: 'IN',
  phone: '9876543210',
  isDefault: false,
};

const SECOND_ADDRESS: SavedAddress = {
  ...SAVED_ADDRESS,
  id: 'addr-work',
  fullName: 'Ada Lovelace (work)',
  line1: '4 Residency Road',
  isDefault: true,
};

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

function makeView(lines: CartLineView[]): CartView {
  return {
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.qty, 0),
    subtotalCents: lines.reduce((sum, line) => sum + line.lineCents, 0),
    currency: 'INR',
    removedCount: 0,
  };
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();
const refreshCart = vi.fn(async () => {});

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(jsonResponse(201, { orderId: 'order-1' }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function setup({
  lines = [makeLine()],
  savedAddresses = [SAVED_ADDRESS],
  isLoading = false,
  view,
}: {
  lines?: CartLineView[];
  savedAddresses?: SavedAddress[];
  isLoading?: boolean;
  view?: CartView | null;
} = {}) {
  useCartStore.setState({
    isLoading,
    view: view === undefined ? makeView(lines) : view,
    refresh: refreshCart,
  });

  render(<CheckoutFlow savedAddresses={savedAddresses} defaultName="Ada Lovelace" />);
  return { user: userEvent.setup() };
}

/** Walks address → delivery → payment → review with a saved address and a valid test card. */
async function goToReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Continue to delivery' }));
  await user.click(screen.getByRole('button', { name: 'Continue to payment' }));

  await user.type(screen.getByLabelText('Card number'), '4242424242424242');
  await user.type(screen.getByLabelText('Expiry (MM/YY)'), '12/30');
  await user.type(screen.getByLabelText('Security code'), '123');
  await user.type(screen.getByLabelText('Name on card'), 'Ada Lovelace');
  await user.click(screen.getByRole('button', { name: 'Review order' }));

  return screen.findByRole('button', { name: /^Place order/ });
}

/** The parsed body of the most recent POST /api/orders. */
function lastOrderBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.at(-1);
  return JSON.parse((call?.[1] as RequestInit).body as string) as Record<string, unknown>;
}

describe('CheckoutFlow', () => {
  describe('when there is nothing to check out', () => {
    it('waits rather than declaring the cart empty', () => {
      setup({ isLoading: true, view: null });

      // Saying "nothing to check out" while the first resolve is in flight sends the shopper back
      // to a cart that is about to appear.
      expect(screen.getByText('Loading your cart…')).toBeInTheDocument();
      expect(screen.queryByText('There is nothing to check out')).not.toBeInTheDocument();
    });

    it('offers a way back to the catalog for an empty cart', () => {
      setup({ lines: [] });

      expect(screen.getByText('There is nothing to check out')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Browse the catalog' })).toHaveAttribute('href', '/');
    });

    it('treats a cart of only out-of-stock lines as nothing to check out', () => {
      setup({ lines: [makeLine({ qty: 0, lineCents: 0, stock: 0 })] });

      // The cart page keeps those rows visible; checkout cannot do anything with them.
      expect(screen.getByText('There is nothing to check out')).toBeInTheDocument();
    });
  });

  describe('moving through the steps', () => {
    it('starts on the address step and says where the shopper is', () => {
      setup();

      expect(screen.getByRole('heading', { name: 'Where should we deliver?' })).toBeInTheDocument();
      // aria-current="step" is how a screen reader conveys position in a flow.
      expect(screen.getByRole('button', { name: /Delivery address/ })).toHaveAttribute(
        'aria-current',
        'step',
      );
    });

    it('locks steps whose inputs depend on earlier answers', () => {
      setup();

      expect(screen.getByRole('button', { name: /Payment/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Review/ })).toBeDisabled();
    });

    it('lets a completed step be revisited', async () => {
      const { user } = setup();

      await user.click(screen.getByRole('button', { name: 'Continue to delivery' }));

      const addressStep = screen.getByRole('button', { name: /Delivery address/ });
      expect(addressStep).toBeEnabled();

      await user.click(addressStep);
      expect(screen.getByRole('heading', { name: 'Where should we deliver?' })).toBeInTheDocument();
    });

    it('preselects the default saved address', () => {
      setup({ savedAddresses: [SAVED_ADDRESS, SECOND_ADDRESS] });

      // SECOND_ADDRESS is the default despite being second in the list.
      expect(screen.getByRole('radio', { name: /Ada Lovelace \(work\)/ })).toBeChecked();
    });

    it('falls back to the first address when none is marked default', () => {
      setup({ savedAddresses: [SAVED_ADDRESS] });

      expect(screen.getByRole('radio', { name: /12 Marlborough Place/ })).toBeChecked();
    });

    it('reaches the review step with everything the shopper is agreeing to', async () => {
      const { user } = setup();

      await goToReview(user);

      expect(screen.getByRole('heading', { name: 'Check everything over' })).toBeInTheDocument();
      // Only a label ever leaves the payment step — never card data.
      expect(screen.getByText(/Visa ending 4242/)).toBeInTheDocument();
      expect(screen.getByText('Kestrel Ultra Webcam')).toBeInTheDocument();
    });
  });

  describe('totals', () => {
    it('are computed by the same function the order API uses', () => {
      const lines = [makeLine({ qty: 2, lineCents: 259_800 })];
      setup({ lines });

      const expected = computeTotals([{ unitCents: 129_900, qty: 2 }], 'standard');
      const summary = within(screen.getByRole('complementary', { name: 'Order summary' }));

      // Asserting against computeTotals rather than a literal is the point: a hardcoded ₹3,065.64
      // would keep passing if the tax rate changed and the two implementations diverged.
      expect(summary.getByText('Total').closest('div')).toHaveTextContent(
        formatMoney(expected.totalCents),
      );
      expect(summary.getByText('Tax').closest('div')).toHaveTextContent(
        formatMoney(expected.taxCents),
      );
    });

    it('shows free delivery as a word rather than a zero amount', () => {
      setup({ lines: [makeLine()] });

      const summary = within(screen.getByRole('complementary', { name: 'Order summary' }));
      expect(summary.getByText('Free')).toBeInTheDocument();
    });

    it('follows the delivery choice', async () => {
      const { user } = setup();

      await user.click(screen.getByRole('button', { name: 'Continue to delivery' }));
      await user.click(screen.getByRole('radio', { name: /Express delivery/ }));

      const summary = within(screen.getByRole('complementary', { name: 'Order summary' }));
      expect(summary.getByText('₹129')).toBeInTheDocument();
    });
  });

  describe('placing the order', () => {
    it('sends the chosen address by id and the delivery option', async () => {
      const { user } = setup();

      const place = await goToReview(user);
      await user.click(place);

      const body = lastOrderBody();
      expect(body.addressId).toBe('addr-home');
      expect(body.deliveryOption).toBe('standard');
      expect(body.paymentLabel).toBe('Visa ending 4242');
      // Exactly one of addressId / address — the API rejects both or neither.
      expect(body.address).toBeUndefined();
    });

    it('goes to the new order, flagged as just placed', async () => {
      const { user } = setup();

      const place = await goToReview(user);
      await user.click(place);

      await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/orders/order-1?placed=1'));
      // The cart was emptied server-side in the same transaction; refreshing keeps the badge honest.
      expect(refreshCart).toHaveBeenCalled();
    });

    it('carries an idempotency key', async () => {
      const { user } = setup();

      const place = await goToReview(user);
      await user.click(place);

      expect(lastOrderBody().idempotencyKey).toMatch(/^co-[0-9a-f]+$/);
    });

    it('reuses the same key when a rejected order is retried', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(409, { error: { message: 'Only 1 left in stock.' } }),
      );
      const { user } = setup();

      const place = await goToReview(user);
      await user.click(place);
      await screen.findByRole('alert');
      const firstKey = lastOrderBody().idempotencyKey;

      await user.click(screen.getByRole('button', { name: /^Place order/ }));
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

      /*
       * The same key on both attempts is the whole double-submit guarantee. The key is memoised on
       * mount for exactly this reason: if it were generated per submit, a retry that races a first
       * request which did in fact get through would create a second order.
       */
      expect(lastOrderBody().idempotencyKey).toBe(firstKey);
    });
  });

  describe('when the order is rejected', () => {
    it('shows the reason and stays on the review step', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(409, { error: { message: 'Only 1 left in stock.' } }),
      );
      const { user } = setup();

      const place = await goToReview(user);
      await user.click(place);

      expect(await screen.findByRole('alert')).toHaveTextContent('Only 1 left in stock.');
      expect(replace).not.toHaveBeenCalled();
    });

    it('re-reads the cart, since a stock rejection means the view is stale', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(409, { error: { message: 'Only 1 left in stock.' } }),
      );
      const { user } = setup();

      const place = await goToReview(user);
      await user.click(place);

      await vi.waitFor(() => expect(refreshCart).toHaveBeenCalled());
    });

    it('does not queue it — a rejection replayed is a rejection repeated', async () => {
      fetchMock.mockResolvedValue(jsonResponse(400, { error: { message: 'Bad address.' } }));
      const { user } = setup();

      const place = await goToReview(user);
      await user.click(place);
      await screen.findByRole('alert');

      expect(enqueueOrder).not.toHaveBeenCalled();
    });

    it('falls back to its own message when the server sends none', async () => {
      fetchMock.mockResolvedValue(jsonResponse(500, {}));
      const { user } = setup();

      const place = await goToReview(user);
      await user.click(place);

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not place your order.');
    });

    it('lets the shopper try again', async () => {
      fetchMock.mockResolvedValue(jsonResponse(500, {}));
      const { user } = setup();

      const place = await goToReview(user);
      await user.click(place);
      await screen.findByRole('alert');

      expect(screen.getByRole('button', { name: /^Place order/ })).toBeEnabled();
    });
  });

  describe('when the request never reaches the server', () => {
    it('queues the order with the key it would have sent live', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      const { user } = setup();

      const place = await goToReview(user);
      await user.click(place);

      await vi.waitFor(() => expect(enqueueOrder).toHaveBeenCalled());

      const call = enqueueOrder.mock.calls[0];
      expect(call).toBeDefined();

      const [key, payload] = call as [string, Record<string, unknown>];
      expect(key).toMatch(/^co-[0-9a-f]+$/);
      // The queued payload carries the same key inside it, which is what makes the replay idempotent
      // even if the original request did get through.
      expect(payload.idempotencyKey).toBe(key);
      expect(payload.addressId).toBe('addr-home');
    });

    it('says the order is saved, not that it failed', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      const { user } = setup();

      const place = await goToReview(user);
      await user.click(place);

      const notice = await screen.findByRole('status');
      expect(notice).toHaveTextContent('Order saved and waiting to send');
      // And it promises what the idempotency key actually guarantees.
      expect(notice).toHaveTextContent('You will not be charged twice');
      expect(replace).not.toHaveBeenCalled();
    });
  });
});
