'use client';

import { CART_STORE, openPrefrMartDb, withStore } from '@/lib/idb';
import { normalizeLines } from '@/lib/cart/merge';
import type { CartLine } from '@/lib/cart/types';

/**
 * Guest cart persistence.
 *
 * IndexedDB rather than localStorage for two reasons that both matter: it is asynchronous, so a
 * large cart never blocks the main thread during a scroll, and it is the only client store a service
 * worker can also reach — which is what makes an offline cart possible.
 *
 * Only `{ productId, qty }` is stored. Prices and titles are resolved from the server on every
 * render, so a tampered local cart can change what is being bought, never at what price.
 *
 * The database is opened through `lib/idb.ts`, which owns the version and the store list. See the
 * note there for why that is centralised.
 */

export async function readGuestCart(): Promise<CartLine[]> {
  const rows = await withStore<unknown[]>(CART_STORE, 'readonly', (store) => store.getAll());
  // Normalise on read: what is on disk may predate a validation change, or have been edited by hand
  // in devtools.
  return normalizeLines(rows ?? []);
}

export async function writeGuestCart(lines: CartLine[]): Promise<void> {
  const normalized = normalizeLines(lines);

  const database = await openPrefrMartDb();
  if (database === null) return;

  await new Promise<void>((resolve) => {
    try {
      const transaction = database.transaction(CART_STORE, 'readwrite');
      const store = transaction.objectStore(CART_STORE);

      // Replace wholesale: the caller always passes the complete cart, so clearing first avoids
      // leaving behind a line the caller meant to remove.
      store.clear();
      for (const line of normalized) store.put(line);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        console.warn('[cart/idb] write failed', transaction.error);
        resolve();
      };
      transaction.onabort = () => resolve();
    } catch (error) {
      console.warn('[cart/idb] write failed', error);
      resolve();
    }
  });
}

export async function clearGuestCart(): Promise<void> {
  await withStore(CART_STORE, 'readwrite', (store) => store.clear() as unknown as IDBRequest<null>);
}
