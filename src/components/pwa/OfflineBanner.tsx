'use client';

import { useEffect, useState } from 'react';

/**
 * Tells the shopper when they are offline, and what still works.
 *
 * Driven by the `online`/`offline` events rather than by polling. `navigator.onLine` is famously
 * unreliable on its own — it reports a network interface, not reachability — so this is treated as a
 * hint for a banner, never as a gate on any behaviour. Nothing is disabled because of it; requests
 * are allowed to fail and are handled where they fail.
 *
 * The initial value is read in an event handler rather than during render: `navigator` does not
 * exist during the server render, and assuming "online" then correcting would flash the banner on
 * every load for someone who is genuinely offline.
 */
export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);

    // Read the current state once, on mount, via the same handler the events use.
    update();

    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      // role="status" not "alert": being offline is a condition, not an error demanding attention.
      role="status"
      className="bg-warning-soft px-3 py-2 text-center text-sm text-warning"
    >
      <strong>You are offline.</strong> Pages you have already visited still work, and your cart is
      saved on this device.
    </div>
  );
}
