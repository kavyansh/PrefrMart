/**
 * Cached sign-in for integration tests.
 *
 * Sign-in is rate-limited to 10 attempts per 15 minutes per IP, and every test in a file
 * shares one IP. Signing in per assertion exhausts that budget and the suite starts failing
 * with rejections — which is the control working correctly, not a bug to tune away.
 *
 * So each account signs in at most once per file and the cookie jar is reused. That is also
 * closer to how a session is actually used: obtained once, then carried.
 *
 * Since the move to NextAuth this drives the real credentials flow rather than a bespoke
 * endpoint: fetch a CSRF token, then post it back with the credentials. Doing it the way a
 * browser does is the point — it exercises the double-submit CSRF check rather than
 * side-stepping it.
 *
 * Each caller presents its own `x-forwarded-for` so attempts are throttled independently.
 * A suite that must make more than ten sign-in attempts is not evidence the limit is too
 * strict — it is one machine standing in for many users. Raising the production limit to
 * fit the tests would be tuning away the control; `callerKey` reads this header, so telling
 * the truth about who is calling costs nothing. The limit itself is asserted directly in
 * auth.integration.test.ts.
 */

const sessions = new Map<string, string>();

export const DEMO_PASSWORD = 'demo1234';

/** NextAuth's cookie over plain HTTP. The `__Secure-` prefix only appears under HTTPS. */
export const SESSION_COOKIE_NAME = 'authjs.session-token';

/** Join every `Set-Cookie` on a response into a single `Cookie` header value. */
function cookieJar(response: Response, existing = ''): string {
  const pairs = new Map<string, string>();

  for (const chunk of existing.split('; ').filter(Boolean)) {
    const name = chunk.split('=')[0];
    if (name !== undefined) pairs.set(name, chunk);
  }

  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(';')[0];
    const name = pair?.split('=')[0];
    // An empty value is a deletion — drop it rather than sending it back.
    if (pair === undefined || name === undefined) continue;
    if (pair.endsWith('=')) pairs.delete(name);
    else pairs.set(name, pair);
  }

  return [...pairs.values()].join('; ');
}

/** Stable per-identity caller address, so one account's attempts never throttle another's. */
function callerAddress(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 16_777_216;
  return `10.${(hash >> 16) & 255}.${(hash >> 8) & 255}.${hash & 255}`;
}

export async function loginAs(baseUrl: string, email: string): Promise<string> {
  const cached = sessions.get(email);
  if (cached !== undefined) return cached;

  // 1. CSRF token, plus the cookie half of the double-submit pair.
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
  if (!csrfResponse.ok) {
    throw new Error(`Could not fetch a CSRF token: ${csrfResponse.status}`);
  }
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
  const jar = cookieJar(csrfResponse);

  // 2. The credentials callback. `redirect: manual` so the 302 is inspectable.
  const response = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: jar,
      origin: baseUrl,
      'x-forwarded-for': callerAddress(email),
    },
    body: new URLSearchParams({ csrfToken, email, password: DEMO_PASSWORD }),
    redirect: 'manual',
  });

  const withSession = cookieJar(response, jar);
  if (!withSession.includes(`${SESSION_COOKIE_NAME}=`)) {
    throw new Error(
      `Sign-in failed for ${email}: ${response.status} → ${response.headers.get('location')}. ` +
        'An `error=` in that location usually means the rate limit was exhausted — check for ' +
        'uncached sign-ins.',
    );
  }

  sessions.set(email, withSession);
  return withSession;
}

/**
 * Attempt a sign-in without caching, and report only whether it succeeded.
 *
 * For tests that assert a rejection, where a thrown error would be the wrong shape.
 */
export async function attemptLogin(
  baseUrl: string,
  email: string,
  password: string,
  /** Override the caller address — pass a fixed value to exhaust one bucket deliberately. */
  ip = callerAddress(email),
): Promise<{ ok: boolean; location: string | null; setCookies: string[] }> {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
  const jar = cookieJar(csrfResponse);

  const response = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: jar,
      origin: baseUrl,
      'x-forwarded-for': ip,
    },
    body: new URLSearchParams({ csrfToken, email, password }),
    redirect: 'manual',
  });

  return {
    ok: cookieJar(response, jar).includes(`${SESSION_COOKIE_NAME}=`),
    location: response.headers.get('location'),
    setCookies: response.headers.getSetCookie(),
  };
}

/** Sign out the way the client does: CSRF token posted back alongside the session. */
export async function signOutWith(
  baseUrl: string,
  cookie: string,
): Promise<{ status: number; setCookies: string[] }> {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`, { headers: { cookie } });
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
  const jar = cookieJar(csrfResponse, cookie);

  const response = await fetch(`${baseUrl}/api/auth/signout`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: jar,
      origin: baseUrl,
    },
    body: new URLSearchParams({ csrfToken }),
    redirect: 'manual',
  });

  return { status: response.status, setCookies: response.headers.getSetCookie() };
}

/** Forget cached sessions — for a test that deliberately signs out. */
export function forgetSession(email: string): void {
  sessions.delete(email);
}
