'use client';

import { useEffect, useState } from 'react';
import { readQueue, replayQueue } from '@/lib/orders/queue';

/**
 * Replays orders queued while offline, once the connection returns.
 *
 * Mounted app-wide rather than on the checkout page, because the shopper who queued an order has
 * almost certainly navigated away by the time they are back online — waiting for them to revisit
 * checkout would mean the order never sends.
 *
 * Safe to run more than once: every queued order carries the idempotency key it was created with, so
 * a replay that races a request which actually got through produces one order, not two.
 */
export function QueuedOrderReplayer() {
  const [pending, setPending] = useState(0);
  const [justSubmitted, setJustSubmitted] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function attempt() {
      const queue = await readQueue();
      if (cancelled) return;

      if (queue.length === 0) {
        setPending(0);
        return;
      }

      setPending(queue.length);

      // Do not bother trying while the browser says there is no network.
      if (!navigator.onLine) return;

      const outcome = await replayQueue();
      if (cancelled) return;

      setJustSubmitted(outcome.submitted);
      setPending((await readQueue()).length);
    }

    // Try on mount — the shopper may have reloaded after coming back online, in which case no
    // `online` event will ever fire.
    void attempt();

    const onOnline = () => void attempt();
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, []);

  if (pending === 0 && justSubmitted === 0) return null;

  return (
    <div role="status" className="bg-info-soft px-3 py-2 text-center text-sm text-info">
      {pending > 0
        ? `${pending} ${pending === 1 ? 'order is' : 'orders are'} waiting to be sent. We will submit ${
            pending === 1 ? 'it' : 'them'
          } as soon as you are back online.`
        : `${justSubmitted} queued ${justSubmitted === 1 ? 'order was' : 'orders were'} submitted.`}
    </div>
  );
}
