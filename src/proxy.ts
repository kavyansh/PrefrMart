import { NextResponse, type NextRequest } from 'next/server';
import { CATEGORY_BY_SLUG } from '@/lib/catalog/taxonomy';
import { loginUrlFor } from '@/lib/auth/redirect';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

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

/**
 * `notFound()` cannot set a 404 status on a streamed response in Next 16 — it renders the
 * correct not-found page but the status is already committed, giving a soft 404 that tells
 * crawlers and uptime monitors a broken URL is fine. Verified against 16.3.1 with a
 * synchronous `notFound()` in a static route: still 200.
 *
 * The proxy runs before rendering, so this is where the status can still be set. The
 * category slugs are a closed static set, so checking them here is cheap and exact; the
 * page still calls `notFound()` to render the body.
 */
/**
 * Routes that require a signed-in user.
 *
 * Guarding here rather than only inside each page means an unauthenticated request never
 * reaches a component that reads account data — there is no chance of a page forgetting the
 * check and briefly rendering someone's orders. The pages still verify the session for their
 * own data access; this is the outer gate, not the only one.
 *
 * The check verifies the JWT signature but does not hit the database, which keeps it Edge-safe
 * and cheap. A token for a since-deleted user passes here and is caught by `getCurrentUser()`
 * returning null.
 */
const PROTECTED_PREFIXES = ['/account', '/checkout', '/orders'] as const;

function requiresAuth(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Signed-in users have no reason to see the sign-in form. */
const AUTH_PAGES = ['/login', '/signup'] as const;

function notFoundStatus(request: NextRequest): number | undefined {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/c/')) return undefined;

  const slug = pathname.slice('/c/'.length).replace(/\/$/, '');
  return CATEGORY_BY_SLUG.has(slug) ? undefined : 404;
}

export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (session === null && requiresAuth(pathname)) {
    // Carries where they were going, so signing in resumes the journey instead of dumping
    // them on the home page. The target is sanitised — see lib/auth/redirect.ts.
    return NextResponse.redirect(new URL(loginUrlFor(pathname, search), request.url));
  }

  if (session !== null && AUTH_PAGES.includes(pathname as (typeof AUTH_PAGES)[number])) {
    return NextResponse.redirect(new URL('/account/profile', request.url));
  }

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

  const response = NextResponse.next({
    request: { headers: requestHeaders },
    status: notFoundStatus(request),
  });
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
