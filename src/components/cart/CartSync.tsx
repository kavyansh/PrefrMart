'use client';

import { useEffect } from 'react';
import { useCartStore } from '@/lib/cart/store';

/**
 * Feeds the session identity into the cart store and triggers the initial load.
 *
 * This exists because the store needs one thing only a Server Component knows: which user, if
 * anyone, is signed in. It renders nothing and wraps nothing — the store replaced the provider, so
 * there is no tree to put children inside any more, and this can sit anywhere under `<body>`.
 *
 * The effect re-runs when the identity changes, which covers signing in, signing out, and one
 * account replacing another. `load` reads `userId` from the store rather than closing over it, so
 * the ordering here is load-bearing: the state must be set before the load starts.
 */
export function CartSync({ userId }: { userId: string | null }) {
  useEffect(() => {
    const { setUserId, load } = useCartStore.getState();
    setUserId(userId);
    void load();
  }, [userId]);

  return null;
}
