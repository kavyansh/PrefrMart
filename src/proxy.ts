import { NextResponse, type NextRequest } from 'next/server';

/**
 * Per-request Content-Security-Policy with a nonce.
 *
 * A nonce-based CSP is what actually stops injected inline <script> from executing:
 * even if an attacker gets markup onto the page, they cannot guess the nonce, so the
 * browser refuses to run it. This is the real defence-in-depth behind React's
 * escaping, and it must be per-request — a static nonce is no nonce at all.
 *
 * Static headers that need no nonce live in next.config.ts instead.
 *
 * This is Next 16's `proxy` convention (the former `middleware.ts`). It runs on the
 * Edge runtime, so this file must not import Node-only modules — notably
 * lib/auth/password.ts, which uses node:crypto scrypt.
 *
 * IMPORTANT constraint this policy imposes on pages:
 * Next stamps the nonce onto its scripts (including 4 inline hydration scripts) only for
 * dynamically rendered responses. A statically prerendered or ISR page carries no nonce,
 * and because 'strict-dynamic' makes browsers ignore the 'self' host source, every script
 * on such a page would be blocked. Any page added here must therefore be dynamic —
 * `export const dynamic = 'force-dynamic'`. Verified by tests/security.test.ts.
 */

export default function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV !== 'production';

  const csp = [
    "default-src 'self'",
    // 'strict-dynamic' lets Next's own nonced bootstrap load its chunks without us
    // having to allow-list every hashed filename.
    // Dev needs 'unsafe-eval' for React Refresh; production never gets it.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ''}`.trim(),
    // Tailwind and Next inject style tags; there is no nonce hook for those, and
    // style injection is not a script-execution vector.
    "style-src 'self' 'unsafe-inline'",
    // data: for the blur placeholders, blob: for locally previewed image uploads.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // Self only: this app talks to no third party.
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');

  // Next reads x-nonce to stamp its own script tags.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);

  return response;
}

export const config = {
  /*
   * Skip static assets and image optimisation: they cannot execute script, and
   * running middleware on them wastes time on every request.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|img/|icons/|manifest.webmanifest|sw.js|robots.txt|sitemap.xml).*)',
  ],
};
