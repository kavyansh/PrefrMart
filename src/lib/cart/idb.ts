'use client';

import { normalizeLines } from '@/lib/cart/merge';
import type { CartLine } from '@/lib/cart/types';

/**
 * Guest cart persistence in IndexedDB.
 *
 * IndexedDB rather than localStorage for two reasons that both matter in Phase 6: it is
 * asynchronous, so a large cart never blocks the main thread during a scroll, and it is the only
 * client store a service worker can also reach — which is what makes an offline cart and a queued
 * order possible at all.
 *
 * Only `{ productId, qty }` is stored. Prices and titles are resolved from the server on every
 * render, so a tampered local cart can change what is being bought, never at what price.
 *
 * Every operation degrades to a no-op rather than throwing. IndexedDB is unavailable in some
 * private-browsing modes and can fail on quota; a shopper in that situation should get a cart
 * that does not persist, not a broken page.
 */

const DB_NAME = 'tender';
const DB_VERSION = 1;
const CART_STORE = 'cart';

function isAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (!isAvailable()) return Promise.resolve(null);
  if (dbPromise !== null) return dbPromise;

  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CART_STORE)) {
        // Keyed by productId, so a line is naturally unique per product.
        database.createObjectStore(CART_STORE, { keyPath: 'productId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('[cart/idb] could not open database', request.error);
      resolve(null);
    };
    // Another tab holding an old version open. Resolving null means this tab falls back to a
    // non-persistent cart rather than hanging forever.
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | null,
): Promise<T | null> {
  return openDatabase().then(
    (database) =>
      new Promise<T | null>((resolve) => {
        if (database === null) {
          resolve(null);
          return;
        }

        try {
          const transaction = database.transaction(CART_STORE, mode);
          const request = work(transaction.objectStore(CART_STORE));

          if (request === null) {
            transaction.oncomplete = () => resolve(null);
            transaction.onerror = () => resolve(null);
            return;
          }

          request.onsuccess = () => resolve(request.result);
          request.onerror = () => {
            console.warn('[cart/idb] request failed', request.error);
            resolve(null);
          };
        } catch (error) {
          console.warn('[cart/idb] transaction failed', error);
          resolve(null);
        }
      }),
  );
}

export async function readGuestCart(): Promise<CartLine[]> {
  const rows = await runTransaction<unknown[]>('readonly', (store) => store.getAll());
  // Normalise on read: whatever is on disk may predate a validation change, or have been
  // edited by hand in devtools.
  return normalizeLines(rows ?? []);
}

export async function writeGuestCart(lines: CartLine[]): Promise<void> {
  const normalized = normalizeLines(lines);

  await openDatabase().then(
    (database) =>
      new Promise<void>((resolve) => {
        if (database === null) {
          resolve();
          return;
        }

        try {
          const transaction = database.transaction(CART_STORE, 'readwrite');
          const store = transaction.objectStore(CART_STORE);

          // Replace wholesale: the caller always passes the complete cart, so clearing first
          // avoids leaving behind a line the caller intended to remove.
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
      }),
  );
}

export async function clearGuestCart(): Promise<void> {
  await runTransaction('readwrite', (store) => store.clear() as unknown as IDBRequest<null>);
}
