import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Keep the server bundle honest about what it pulls in.
  serverExternalPackages: ['@prisma/client'],

  experimental: {
    /*
     * Client-side router cache.
     *
     * Every route here is `force-dynamic` (see proxy.ts for why), and the default `dynamic` stale
     * time for such routes is 0 — meaning the router keeps nothing, so navigating back to a page
     * refetches its payload from scratch every single time. Combined with a Suspense fallback, that
     * is a visible skeleton flash on every repeat visit.
     *
     * 30 seconds is short enough that stock and prices stay current within a browsing session, and
     * long enough that moving between the catalog, a product and the cart feels instant.
     */
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },

  images: {
    // Seeded product art is local SVG, so the optimizer must be allowed to pass it through.
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 420, 640, 768, 1024, 1280, 1600],
    imageSizes: [64, 96, 128, 192, 256],
  },

  async headers() {
    // Note: CSP is set per-request in proxy.ts because it carries a nonce.
    // Everything here is static and safe to send from config.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          {
            key: 'Permissions-Policy',
            // Camera stays enabled for the image-search capture input (Phase 6).
            value: 'geolocation=(), microphone=(), payment=(), usb=(), camera=(self)',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
