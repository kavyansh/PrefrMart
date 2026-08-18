'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
 * runs exactly once per transition — `mergedForRef` guards it, because running it twice would
 * double every quantity.
 */

type CartContextValue = {
  /** Resolved view, or null until the first load completes. */
  view: CartView | null;
  isLoading: boolean;
  error: string | null;
  /** Total units, available before the full view resolves so the header badge can paint early. */
  itemCount: number;
  addItem: (productId: string, qty?: number) => Promise<void>;
  setQty: (productId: string, qty: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (context === null) throw new Error('useCart must be used inside a CartProvider');
  return context;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: url === '/api/cart' ? 'PUT' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url} failed with ${response.status}`);
  return (await response.json()) as T;
}

export function CartProvider({
  children,
  /** Passed from a Server Component, so the provider knows which mode to run in. */
  userId,
}: {
  children: ReactNode;
  userId: string | null;
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [view, setView] = useState<CartView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Which user id the guest cart has already been merged for. Written only inside effects.
  const mergedForRef = useRef<string | null>(null);

  /** Resolve lines for display. Guests post their lines; signed-in users read the server cart. */
  const resolve = useCallback(
    async (currentLines: CartLine[]): Promise<CartView> => {
      if (userId === null) {
        return postJson<CartView>('/api/cart/resolve', { lines: currentLines });
      }
      const response = await fetch('/api/cart', { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`/api/cart failed with ${response.status}`);
      return (await response.json()) as CartView;
    },
    [userId],
  );

  // Initial load, and re-run whenever the signed-in identity changes.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        if (userId === null) {
          // Signed out: local store is the truth. Also covers signing *out* — the previous
          // user's server cart must not linger on screen.
          mergedForRef.current = null;
          const guestLines = await readGuestCart();
          if (cancelled) return;

          setLines(guestLines);
          setView(await resolve(guestLines));
          return;
        }

        // Signed in. Fold in anything collected as a guest, exactly once per identity.
        if (mergedForRef.current !== userId) {
          const guestLines = await readGuestCart();
          mergedForRef.current = userId;

          if (guestLines.length > 0) {
            const merged = await postJson<CartView>('/api/cart/merge', { lines: guestLines });
            // Only clear local storage once the server has accepted the merge, so a failure
            // does not lose the basket.
            await clearGuestCart();
            if (cancelled) return;

            setLines(merged.lines.map((line) => ({ productId: line.productId, qty: line.qty })));
            setView(merged);
            return;
          }
        }

        const serverView = await resolve([]);
        if (cancelled) return;
        setLines(serverView.lines.map((line) => ({ productId: line.productId, qty: line.qty })));
        setView(serverView);
      } catch (cause) {
        if (cancelled) return;
        console.error('[cart] load failed', cause);
        setError('Could not load your cart.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, resolve]);

  /**
   * Apply a change to the whole line set.
   *
   * Optimistic: local state updates immediately so a quantity stepper feels instant, then the
   * authoritative view replaces it. On failure the server view is re-read rather than the previous
   * state being restored from memory — after a failed write, what the server holds is the only
   * thing worth trusting.
   */
  const commit = useCallback(
    async (nextLines: CartLine[]) => {
      const normalized = normalizeLines(nextLines);
      setLines(normalized);
      setError(null);

      try {
        if (userId === null) {
          await writeGuestCart(normalized);
          setView(await postJson<CartView>('/api/cart/resolve', { lines: normalized }));
          return;
        }

        setView(await postJson<CartView>('/api/cart', { lines: normalized }));
      } catch (cause) {
        console.error('[cart] update failed', cause);
        setError('Could not update your cart.');
        try {
          const authoritative = await resolve(normalized);
          setView(authoritative);
          setLines(authoritative.lines.map((line) => ({ productId: line.productId, qty: line.qty })));
        } catch {
          // Offline. Leave the optimistic state; Phase 6 queues the write.
        }
      }
    },
    [userId, resolve],
  );

  const addItem = useCallback(
    async (productId: string, qty = 1) => {
      const existing = lines.find((line) => line.productId === productId);
      const next = existing
        ? lines.map((line) =>
            line.productId === productId ? { ...line, qty: line.qty + qty } : line,
          )
        : [...lines, { productId, qty }];
      await commit(next);
    },
    [lines, commit],
  );

  const setQty = useCallback(
    async (productId: string, qty: number) => {
      // Zero means remove: a stepper decremented to nothing should not leave an empty row.
      const next =
        qty <= 0
          ? lines.filter((line) => line.productId !== productId)
          : lines.map((line) => (line.productId === productId ? { ...line, qty } : line));
      await commit(next);
    },
    [lines, commit],
  );

  const removeItem = useCallback(
    async (productId: string) => {
      await commit(lines.filter((line) => line.productId !== productId));
    },
    [lines, commit],
  );

  const clear = useCallback(async () => {
    await commit([]);
  }, [commit]);

  const refresh = useCallback(async () => {
    try {
      const authoritative = await resolve(lines);
      setView(authoritative);
    } catch (cause) {
      console.error('[cart] refresh failed', cause);
    }
  }, [lines, resolve]);

  const value = useMemo<CartContextValue>(
    () => ({
      view,
      isLoading,
      error,
      // Prefer the resolved count, but fall back to local lines so the badge is not blank
      // while the first resolve is in flight.
      itemCount: view?.itemCount ?? lines.reduce((sum, line) => sum + line.qty, 0),
      addItem,
      setQty,
      removeItem,
      clear,
      refresh,
    }),
    [view, isLoading, error, lines, addItem, setQty, removeItem, clear, refresh],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
