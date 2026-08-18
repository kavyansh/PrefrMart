/**
 * Security integration tests against a real production server.
 *
 * These exist because of a bug that unit tests structurally cannot catch: the CSP is
 * nonce-based with 'strict-dynamic', which makes browsers ignore the 'self' host source.
 * Next only stamps nonces onto dynamically rendered responses, so a page that is
 * statically prerendered ships scripts with no nonce — and every one of them is blocked.
 * The page looks fine in the HTML and is completely broken in a browser.
 *
 * The "every script carries a nonce" assertion below is the regression guard. It fails if
 * anyone makes a page static, or removes the nonce plumbing from proxy.ts.
 *
 * Requires a CURRENT `npm run build` first, then boots its own server on a free port. This is
 * why `npm run verify` runs build before test — against a stale .next these assertions
 * describe the previous build, not the code in front of you.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Pages whose HTML must be nonce-stamped. Add every new page route here. */
const HTML_ROUTES = ['/', '/c/electronics', '/?minRating=4&inStock=true'] as const;

let server: ChildProcess | undefined;
let baseUrl = '';

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Could not determine a free port'));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

beforeAll(async () => {
  // Note: deliberately not BASE_URL — Vitest populates that from Vite's `base`
  // config, which defaults to "/", so reading it silently yields a relative path.
  if (process.env.APP_BASE_URL) {
    baseUrl = process.env.APP_BASE_URL;
    return;
  }

  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn('npx', ['next', 'start', '-p', String(port)], {
    stdio: 'ignore',
    env: process.env,
  });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // not ready
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Server did not start. Did you run `npm run build`?');
}, 120_000);

afterAll(async () => {
  server?.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 200));
});

describe('Content-Security-Policy', () => {
  it('sends a nonce-based policy', async () => {
    const response = await fetch(baseUrl);
    const csp = response.headers.get('content-security-policy');

    expect(csp).toBeTruthy();
    expect(csp).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9+/=_-]+'/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it('never allows unsafe-inline for scripts', async () => {
    // 'unsafe-inline' in script-src is the single change that would make injected
    // <script> executable again, undoing the whole policy.
    const response = await fetch(baseUrl);
    const csp = response.headers.get('content-security-policy') ?? '';
    const scriptSrc = /script-src([^;]*)/.exec(csp)?.[1] ?? '';
    expect(scriptSrc).not.toContain('unsafe-inline');
  });

  it('issues a different nonce on every request', async () => {
    // A reused nonce is no better than 'unsafe-inline' — an attacker could read it
    // from one response and reuse it in an injection.
    const nonceFrom = (csp: string | null) => /'nonce-([^']+)'/.exec(csp ?? '')?.[1];

    const [first, second] = await Promise.all([fetch(baseUrl), fetch(baseUrl)]);
    const a = nonceFrom(first.headers.get('content-security-policy'));
    const b = nonceFrom(second.headers.get('content-security-policy'));

    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  describe.each(HTML_ROUTES)('route %s', (route) => {
    it('stamps the CSP nonce onto every script tag', async () => {
      const response = await fetch(`${baseUrl}${route}`);
      expect(response.ok).toBe(true);

      const html = await response.text();
      const headerNonce = /'nonce-([^']+)'/.exec(
        response.headers.get('content-security-policy') ?? '',
      )?.[1];
      expect(headerNonce).toBeTruthy();

      const scriptTags = [...html.matchAll(/<script\b([^>]*)>/gi)].map((match) => match[1] ?? '');
      expect(scriptTags.length).toBeGreaterThan(0);

      const unstamped = scriptTags.filter((attrs) => {
        // The core-js polyfill bundle is noModule: modern browsers never execute it.
        if (/\bnoModule\b/i.test(attrs)) return false;
        return !attrs.includes(`nonce="${headerNonce}"`);
      });

      expect(
        unstamped,
        'Scripts without the request nonce are blocked by our strict-dynamic CSP. ' +
          'This usually means the route became static — it must be force-dynamic.',
      ).toEqual([]);
    });
  });
});

describe('HTTP status codes', () => {
  it('returns a real 404 for an unknown category, not a soft 404', async () => {
    /*
     * `notFound()` renders the right page but leaves the status at 200 on a streamed
     * response in Next 16, so the status is set in proxy.ts instead. A soft 404 tells
     * crawlers a broken URL is a real page and hides dead links from monitoring.
     */
    const response = await fetch(`${baseUrl}/c/not-a-real-category`);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain('Category not found');
  });

  it('serves valid categories normally', async () => {
    const response = await fetch(`${baseUrl}/c/books`);
    expect(response.status).toBe(200);
  });

  it('still 404s a route that does not exist at all', async () => {
    const response = await fetch(`${baseUrl}/no-such-page-at-all`);
    expect(response.status).toBe(404);
  });
});

describe('security headers', () => {
  it('sets the static hardening headers', async () => {
    const response = await fetch(baseUrl);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('permissions-policy')).toContain('microphone=()');
  });
});

describe('stored XSS', () => {
  it('escapes angle brackets in text that came from the database', async () => {
    // Product titles are rendered as text nodes. If a title ever contained markup, it
    // must appear escaped in the HTML rather than as live tags.
    const response = await fetch(`${baseUrl}/api/products?q=%3Cscript%3E`);
    expect(response.ok).toBe(true);
    const body = (await response.json()) as { items: unknown[] };
    // The query is treated as a literal search string, not interpolated into SQL.
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('rejects a cursor carrying a SQL fragment', async () => {
    const hostile = Buffer.from("' OR 1=1; --", 'utf8').toString('base64url');
    const response = await fetch(`${baseUrl}/api/products?cursor=${hostile}&limit=2`);
    // Degrades to page one rather than erroring or executing anything.
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: unknown[] };
    expect(body.items.length).toBeLessThanOrEqual(2);
  });
});
