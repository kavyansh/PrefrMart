import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Keep the server bundle honest about what it pulls in.
  serverExternalPackages: ['@prisma/client'],

  images: {
    // Seeded product art is local SVG, so the optimizer must be allowed to pass it through.
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 420, 640, 768, 1024, 1280, 1600],
    imageSizes: [64, 96, 128, 192, 256],
  },

  async headers() {
    // Note: CSP is set per-request in middleware.ts because it carries a nonce.
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
