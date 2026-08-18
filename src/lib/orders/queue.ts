'use client';

import { QUEUE_STORE, withStore as withIdbStore } from '@/lib/idb';
import type { PlaceOrderInput } from '@/lib/validation/schemas';

/**
 * Queue for orders submitted while offline.
 *
 * The idempotency key is what makes this safe. It is generated when the checkout flow mounts, so a
 * queued order carries the same key it would have sent live — meaning a replay that races a request
 * which actually got through produces one order, not two. Without that, retrying a request whose
 * response was lost is a coin flip between "no order" and "two orders".
 *
 * Replay is driven by the page's `online` event rather than the Background Sync API. Background Sync
 * would survive the tab being closed, which is genuinely better, but it is Chromium-only and needs
 * the service worker to hold credentials and interpret failures. The page-driven version works in
 * every browser and fails visibly; the trade is that the tab has to still be open.
 *
 * Stored in IndexedDB, not localStorage, so the same store is reachable from a service worker if
 * this is ever moved there. The database is opened through lib/idb.ts, which owns the version and
 * the store list — see the note there for why that must not be duplicated.
 */

export type QueuedOrder = {
  /** The idempotency key doubles as the primary key — one queue entry per attempt. */
  idempotencyKey: string;
  payload: PlaceOrderInput;
  queuedAt: number;
  /** Attempts made so far, so a permanently failing entry can be given up on. */
  attempts: number;
};

const MAX_ATTEMPTS = 5;

export async function enqueueOrder(
  idempotencyKey: string,
  payload: PlaceOrderInput,
): Promise<void> {
  await withIdbStore(QUEUE_STORE, 'readwrite', (store) =>
    store.put({ idempotencyKey, payload, queuedAt: Date.now(), attempts: 0 } satisfies QueuedOrder),
  );
}

export async function readQueue(): Promise<QueuedOrder[]> {
  const rows = await withIdbStore<QueuedOrder[]>(QUEUE_STORE, 'readonly', (store) => store.getAll());
  return rows ?? [];
}

export async function removeFromQueue(idempotencyKey: string): Promise<void> {
  await withIdbStore(QUEUE_STORE, 'readwrite', (store) => store.delete(idempotencyKey) as unknown as IDBRequest<undefined>);
}

async function recordAttempt(entry: QueuedOrder): Promise<void> {
  await withIdbStore(QUEUE_STORE, 'readwrite', (store) =>
    store.put({ ...entry, attempts: entry.attempts + 1 } satisfies QueuedOrder),
  );
}

export type ReplayOutcome = {
  submitted: number;
  failed: number;
  abandoned: number;
};

/**
 * Attempt every queued order.
 *
 * A 4xx other than 429 means the request will never succeed — an empty cart, a rejected address, a
 * key already used — so the entry is dropped rather than retried forever. A 5xx or a network failure
 * is transient and keeps its place until MAX_ATTEMPTS.
 */
export async function replayQueue(): Promise<ReplayOutcome> {
  const queue = await readQueue();
  const outcome: ReplayOutcome = { submitted: 0, failed: 0, abandoned: 0 };

  for (const entry of queue) {
    if (entry.attempts >= MAX_ATTEMPTS) {
      await removeFromQueue(entry.idempotencyKey);
      outcome.abandoned++;
      continue;
    }

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(entry.payload),
      });

      if (response.ok) {
        // Covers 201 (created) and 200 (the idempotency key already produced this order).
        await removeFromQueue(entry.idempotencyKey);
        outcome.submitted++;
        continue;
      }

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        // Permanently rejected. Retrying cannot change the answer.
        await removeFromQueue(entry.idempotencyKey);
        outcome.abandoned++;
        continue;
      }

      await recordAttempt(entry);
      outcome.failed++;
    } catch {
      // Still offline.
      await recordAttempt(entry);
      outcome.failed++;
    }
  }

  return outcome;
}
