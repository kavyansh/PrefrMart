'use client';

import { create } from 'zustand';
import { clearGuestCart, readGuestCart, writeGuestCart } from '@/lib/cart/idb';
import { normalizeLines } from '@/lib/cart/merge';
import type { CartLine, CartView } from '@/lib/cart/types';

/**
 * One cart interface for guests and signed-in shoppers.
 *
 * The difference is only where the lines live:
 *
 *  - Signed out: IndexedDB is authoritative. The server resolves prices via /api/cart/resolve, so
 *    a guest cart still cannot invent a price.
 *  - Signed in: the server is authoritative. Every mutation PUTs the complete line set, which
 *    makes it idempotent and means two racing quantity changes cannot lose one.
 *
 * On sign-in the guest lines are merged server-side and the local store is cleared. That merge
 * runs exactly once per transition — `mergedFor` guards it, because running it twice would double
 * every quantity.
 *
 * Why a module-level store rather than a context provider: every consumer here wants a *different*
 * slice of the cart. The header badge only needs a number and re-rendered on every keystroke of a
 * quantity stepper under context, because context hands out one object and any change to it
 * invalidates every consumer. Selectors make each component subscribe to exactly what it reads.
 *
 * SSR safety: this is a singleton shared by every render on the server, which would be a
 * cross-request leak if anything wrote to it there. Nothing does — the initial state below is
 * constant, and every write happens in an effect or an event handler, neither of which runs during
 * SSR. Client components therefore server-render against the same empty, loading cart they would
 * have had under the provider, and the real state arrives after hydration.
 */

type CartState = {
  /** Which identity the cart is running as. Null means guest. Fed by `CartSync`. */
  userId: string | null;
  /** Client-side truth: product ids and quantities, never prices. */
  lines: CartLine[];
  /** Resolved view, or null until the first load completes. */
  view: CartView | null;
  isLoading: boolean;
  error: string | null;

  /**
   * Which user id the guest cart has already been merged for.
   *
   * Was a ref under the provider. It is deliberately part of the store rather than a module
   * variable so that resetting the store in a test resets it too.
   */
  mergedFor: string | null;
  /**
   * Increments on every load. An in-flight load whose token has been superseded discards its
   * result, which is what the `cancelled` flag in the provider's effect cleanup used to do.
   */
  loadToken: number;

  setUserId: (userId: string | null) => void;
  load: () => Promise<void>;
  addItem: (productId: string, qty?: number) => Promise<void>;
  setQty: (productId: string, qty: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: url === '/api/cart' ? 'PUT' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url} failed with ${response.status}`);
  return (await response.json()) as T;
}

/** Lines as the client stores them, from a resolved server view. */
function toLines(view: CartView): CartLine[] {
  return view.lines.map((line) => ({ productId: line.productId, qty: line.qty }));
}

export const useCartStore = create<CartState>()((set, get) => {
  /** Resolve lines for display. Guests post their lines; signed-in users read the server cart. */
  async function resolve(currentLines: CartLine[]): Promise<CartView> {
    if (get().userId === null) {
      return postJson<CartView>('/api/cart/resolve', { lines: currentLines });
    }
    const response = await fetch('/api/cart', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`/api/cart failed with ${response.status}`);
    return (await response.json()) as CartView;
  }

  /**
   * Apply a change to the whole line set.
   *
   * Optimistic: local state updates immediately so a quantity stepper feels instant, then the
   * authoritative view replaces it. On failure the server view is re-read rather than the previous
   * state being restored from memory — after a failed write, what the server holds is the only
   * thing worth trusting.
   */
  async function commit(nextLines: CartLine[]): Promise<void> {
    const normalized = normalizeLines(nextLines);
    set({ lines: normalized, error: null });

    try {
      if (get().userId === null) {
        await writeGuestCart(normalized);
        set({ view: await postJson<CartView>('/api/cart/resolve', { lines: normalized }) });
        return;
      }

      set({ view: await postJson<CartView>('/api/cart', { lines: normalized }) });
    } catch (cause) {
      console.error('[cart] update failed', cause);
      set({ error: 'Could not update your cart.' });
      try {
        const authoritative = await resolve(normalized);
        set({ view: authoritative, lines: toLines(authoritative) });
      } catch {
        // Offline. Leave the optimistic state; the queued-write path picks it up.
      }
    }
  }

  return {
    userId: null,
    lines: [],
    view: null,
    isLoading: true,
    error: null,
    mergedFor: null,
    loadToken: 0,

    setUserId: (userId) => set({ userId }),

    load: async () => {
      const token = get().loadToken + 1;
      set({ loadToken: token, isLoading: true, error: null });

      /** True once a newer load has started, so this one must not touch state. */
      const superseded = () => get().loadToken !== token;

      try {
        const { userId } = get();

        if (userId === null) {
          // Signed out: local store is the truth. Also covers signing *out* — the previous
          // user's server cart must not linger on screen.
          set({ mergedFor: null });
          const guestLines = await readGuestCart();
          if (superseded()) return;

          set({ lines: guestLines });
          const view = await resolve(guestLines);
          if (superseded()) return;

          set({ view });
          return;
        }

        // Signed in. Fold in anything collected as a guest, exactly once per identity.
        if (get().mergedFor !== userId) {
          const guestLines = await readGuestCart();
          set({ mergedFor: userId });

          if (guestLines.length > 0) {
            const merged = await postJson<CartView>('/api/cart/merge', { lines: guestLines });
            // Only clear local storage once the server has accepted the merge, so a failure
            // does not lose the basket.
            await clearGuestCart();
            if (superseded()) return;

            set({ lines: toLines(merged), view: merged });
            return;
          }
        }

        const serverView = await resolve([]);
        if (superseded()) return;
        set({ lines: toLines(serverView), view: serverView });
      } catch (cause) {
        if (superseded()) return;
        console.error('[cart] load failed', cause);
        set({ error: 'Could not load your cart.' });
      } finally {
        if (!superseded()) set({ isLoading: false });
      }
    },

    addItem: async (productId, qty = 1) => {
      const { lines } = get();
      const existing = lines.find((line) => line.productId === productId);
      const next = existing
        ? lines.map((line) =>
            line.productId === productId ? { ...line, qty: line.qty + qty } : line,
          )
        : [...lines, { productId, qty }];
      await commit(next);
    },

    setQty: async (productId, qty) => {
      const { lines } = get();
      // Zero means remove: a stepper decremented to nothing should not leave an empty row.
      const next =
        qty <= 0
          ? lines.filter((line) => line.productId !== productId)
          : lines.map((line) => (line.productId === productId ? { ...line, qty } : line));
      await commit(next);
    },

    removeItem: async (productId) => {
      await commit(get().lines.filter((line) => line.productId !== productId));
    },

    clear: async () => {
      await commit([]);
    },

    refresh: async () => {
      try {
        const authoritative = await resolve(get().lines);
        set({ view: authoritative });
      } catch (cause) {
        console.error('[cart] refresh failed', cause);
      }
    },
  };
});

/*
 * Selector hooks.
 *
 * Every one of these returns a primitive or a stable reference, so none of them needs a shallow
 * comparator. That is the point of splitting them up: `CartBadge` subscribes to a number and does
 * not re-render when a line's price resolves, and `AddToCartButton` subscribes to a function that
 * never changes identity and so never re-renders at all.
 *
 * Reach for `useCartStore` directly with your own selector for anything not covered here.
 */

export const useCartView = () => useCartStore((state) => state.view);
export const useCartIsLoading = () => useCartStore((state) => state.isLoading);
export const useCartError = () => useCartStore((state) => state.error);

/**
 * Total units. Prefers the resolved count, but falls back to local lines so the badge is not blank
 * while the first resolve is in flight.
 */
export const useCartItemCount = () =>
  useCartStore(
    (state) => state.view?.itemCount ?? state.lines.reduce((sum, line) => sum + line.qty, 0),
  );

export const useAddItem = () => useCartStore((state) => state.addItem);
export const useSetQty = () => useCartStore((state) => state.setQty);
export const useRemoveItem = () => useCartStore((state) => state.removeItem);
export const useRefreshCart = () => useCartStore((state) => state.refresh);
