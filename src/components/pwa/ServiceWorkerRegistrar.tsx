'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker.
 *
 * Production only. A service worker in development serves stale chunks after every edit, which
 * looks exactly like a broken hot reload and wastes an afternoon before anyone suspects the cache.
 *
 * Renders nothing — it exists solely for the effect, which is the legitimate use of one: talking to
 * a browser API that React knows nothing about.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    // Registered after load so it never competes with the first paint for bandwidth.
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
        // A failed registration must not break the page; the site works without it.
        console.warn('[pwa] service worker registration failed', error);
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }

    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
