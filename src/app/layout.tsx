import type { Metadata, Viewport } from 'next';
import { CartSync } from '@/components/cart/CartSync';
import { QueryProvider } from '@/components/query/QueryProvider';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { QueuedOrderReplayer } from '@/components/pwa/QueuedOrderReplayer';
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar';
import { getSessionUserId } from '@/lib/auth/session';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'PrefrMart — everyday essentials, honestly priced',
    template: '%s · PrefrMart',
  },
  description:
    'A mobile-first storefront demo: browse a large catalog, search, review products, and check out.',
  applicationName: 'PrefrMart',
  formatDetection: { telephone: false },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'PrefrMart',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never lock zoom — pinch-to-zoom is an accessibility necessity, not a nuisance.
  maximumScale: 5,
  // Single value: this is a light-mode design, and the header is the dark navy brand bar, which
  // is what the browser chrome should match. A dark variant here would advertise a theme the
  // stylesheet does not have.
  themeColor: '#0d1b2a',
  colorScheme: 'light',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /*
   * Read the session here so the cart store knows which mode to run in. Only the id is passed
   * down — enough to decide "local store or server cart" and to detect a change of identity, and
   * nothing a client component has any business knowing beyond that.
   */
  const userId = await getSessionUserId();

  return (
    <html lang="en">
      <body className="min-h-dvh">
        {/*
          Skip link: the first tabbable element on every page, so a keyboard user can
          jump past the header and category rail straight to the products.
        */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:font-medium focus:shadow-lg"
        >
          Skip to main content
        </a>
        <QueryProvider>
          <CartSync userId={userId} />
          {/*
            Both banners sit above the header so they push content down rather than covering it —
            an overlay on a sticky header hides the search box exactly when someone is trying to
            work out why nothing is loading.
          */}
          <OfflineBanner />
          <QueuedOrderReplayer />
          {children}
        </QueryProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
