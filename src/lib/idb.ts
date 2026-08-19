'use client';

/**
 * The one place the IndexedDB database is opened.
 *
 * This exists because of a bug: the cart opened `prefrmart` at version 1 and the order queue
 * opened it at version 2. IndexedDB refuses to open a database at a *lower* version than it has, so
 * whichever module ran second failed with a VersionError — and which one that was depended on
 * whether the shopper visited the cart or checked out first. A shared opener makes the version and
 * the set of stores impossible to disagree about.
 *
 * Adding a store means bumping DB_VERSION and creating it in `onupgradeneeded` alongside the
 * others. Every store must be created there unconditionally-guarded, because a browser upgrading
 * from any earlier version runs only this one handler.
 *
 * Every failure resolves to null rather than throwing. IndexedDB is unavailable in some
 * private-browsing modes and can be blocked by another tab holding an older version; a shopper in
 * that situation should get a cart that does not persist, not a broken page.
 */

export const DB_NAME = 'prefrmart';
export const DB_VERSION = 2;

export const CART_STORE = 'cart';
export const QUEUE_STORE = 'queued-orders';

let dbPromise: Promise<IDBDatabase | null> | null = null;

export function openPrefrMartDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise !== null) return dbPromise;

  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      // v1: the guest cart, keyed by product so a line is naturally unique.
      if (!database.objectStoreNames.contains(CART_STORE)) {
        database.createObjectStore(CART_STORE, { keyPath: 'productId' });
      }

      // v2: orders submitted while offline, keyed by idempotency key so one attempt is one entry.
      if (!database.objectStoreNames.contains(QUEUE_STORE)) {
        database.createObjectStore(QUEUE_STORE, { keyPath: 'idempotencyKey' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('[idb] could not open database', request.error);
      resolve(null);
    };
    // Another tab is holding an older version open. Falling back to null means this tab works
    // without persistence rather than hanging indefinitely.
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

/** Run one request against a store, resolving to null on any failure. */
export function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openPrefrMartDb().then(
    (database) =>
      new Promise<T | null>((resolve) => {
        if (database === null) {
          resolve(null);
          return;
        }
        try {
          const transaction = database.transaction(storeName, mode);
          const request = work(transaction.objectStore(storeName));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => {
            console.warn('[idb] request failed', request.error);
            resolve(null);
          };
        } catch (error) {
          console.warn('[idb] transaction failed', error);
          resolve(null);
        }
      }),
  );
}
