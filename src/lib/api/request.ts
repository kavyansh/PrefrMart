import type { NextRequest } from 'next/server';

/**
 * Origin checks for state-changing requests.
 *
 * `SameSite=Lax` on the session cookie already stops the browser attaching it to cross-site
 * POSTs, which handles most CSRF. This is the second layer, and it is cheap: a browser sets
 * `Origin` and `Sec-Fetch-Site` itself and page JavaScript cannot forge them, so a request
 * originating from an attacker's page announces itself.
 *
 * `Sec-Fetch-Site` is preferred over `Origin` because some legitimate same-origin requests
 * omit `Origin` entirely.
 *
 * IMPORTANT — do not compare against `request.nextUrl.origin`. Measured on Next 16.3.1, that
 * value is normalised to `http://localhost:<port>` no matter which host the request actually
 * arrived on: a request to `http://127.0.0.1:3111` still reports `nextUrl.origin` as
 * `http://localhost:3111`. Comparing `Origin` to it therefore rejects perfectly legitimate
 * same-origin requests, and would break every form the moment the app is served under a real
 * hostname or behind a proxy. The `Host` header is what actually reflects where the request
 * was sent.
 *
 * `Host` being client-supplied does not weaken this: the property that matters is that a
 * victim's browser reports the *attacker's* origin truthfully. An attacker forging both
 * headers is just making a request as themselves, which is not CSRF.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite !== null) {
    // 'none' is a direct navigation (address bar or bookmark), which cannot be a forged POST.
    return fetchSite === 'same-origin' || fetchSite === 'none';
  }

  const origin = request.headers.get('origin');
  /*
   * No Origin and no Sec-Fetch-Site means a non-browser client such as curl. Allowed: this is
   * not an authentication check — the session cookie still governs access — and rejecting it
   * would break API testing and scripted use for no security gain, since a non-browser client
   * has no victim's cookies to ride on.
   */
  if (origin === null) return true;

  // Behind a proxy the forwarded host is the one the browser addressed.
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (host === null) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    // Unparseable Origin: treat as hostile.
    return false;
  }
}
