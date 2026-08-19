/**
 * Authentication, route guards and account-data isolation, end to end.
 *
 * The isolation tests here are the important ones. Every other bug in this file's scope shows
 * up as a broken page; a scoping mistake in an order query shows up as one customer reading
 * another's purchase history, silently, with a 200.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type TestServer } from './helpers/server';
import { testDb } from './helpers/db';
import {
  attemptLogin,
  DEMO_PASSWORD as PASSWORD,
  forgetSession,
  loginAs,
  SESSION_COOKIE_NAME,
  signOutWith,
} from './helpers/auth';

let server: TestServer;
let baseUrl: string;
/** Accounts created by tests, removed in afterAll so runs stay repeatable. */
const createdEmails: string[] = [];

/** Cached per account — the login endpoint is rate-limited. See helpers/auth.ts. */
const login = (email: string) => loginAs(baseUrl, email);

/** Redirects must not be followed: the status and Location are what we are asserting. */
function noFollow(cookie?: string): RequestInit {
  return {
    redirect: 'manual',
    headers: cookie === undefined ? {} : { cookie },
  };
}

beforeAll(async () => {
  server = await startServer();
  baseUrl = server.baseUrl;
}, 120_000);

afterAll(async () => {
  if (createdEmails.length > 0) {
    await testDb.user.deleteMany({ where: { email: { in: createdEmails } } });
  }
  await testDb.$disconnect();
  await server?.stop();
});

describe('route guards', () => {
  const protectedPaths = ['/account/profile', '/account/orders', '/checkout', '/orders/anything'];

  it.each(protectedPaths)('redirects %s to sign-in when signed out', async (path) => {
    const response = await fetch(`${baseUrl}${path}`, noFollow());

    expect(response.status).toBe(307);
    const location = response.headers.get('location') ?? '';
    expect(location).toContain('/login');
    // Carries the destination so signing in resumes the journey.
    expect(location).toContain(`next=${encodeURIComponent(path)}`);
  });

  it('lets a signed-in user through', async () => {
    const cookie = await login('asha@example.com');
    const response = await fetch(`${baseUrl}/account/profile`, noFollow(cookie));
    expect(response.status).toBe(200);
  });

  it('sends a signed-in user away from the sign-in page', async () => {
    const cookie = await login('asha@example.com');
    const response = await fetch(`${baseUrl}/login`, noFollow(cookie));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/account/profile');
  });

  it('ignores a forged session cookie', async () => {
    // The signature is what matters, not the presence of a cookie.
    const response = await fetch(`${baseUrl}/account/profile`, noFollow('session=not-a-real-jwt'));
    expect(response.status).toBe(307);
  });

  it('leaves public pages alone', async () => {
    for (const path of ['/', '/c/books', '/login', '/signup']) {
      const response = await fetch(`${baseUrl}${path}`, noFollow());
      expect(response.status, path).toBe(200);
    }
  });
});

describe('sign-up', () => {
  it('creates an account that can immediately sign in', async () => {
    const email = `signup-${Date.now()}@example.test`;
    const password = 'a-good-long-password';
    createdEmails.push(email);

    const response = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New Person', email, password }),
    });

    // 201 and NO session: NextAuth has no credentials registration flow, so this route
    // creates the row and the client signs in separately. A cookie minted here would not
    // be one NextAuth recognises.
    expect(response.status).toBe(201);
    // No SESSION cookie. The proxy is wrapped by NextAuth, so responses do carry its
    // csrf-token and callback-url cookies — those are plumbing, not a signed-in state.
    expect(
      response.headers.getSetCookie().filter((raw) => raw.startsWith(`${SESSION_COOKIE_NAME}=`)),
    ).toEqual([]);

    const signIn = await attemptLogin(baseUrl, email, password);
    expect(signIn.ok, `sign-in after sign-up failed: ${signIn.location}`).toBe(true);

    const sessionCookie = signIn.setCookies.find((raw) =>
      raw.startsWith(`${SESSION_COOKIE_NAME}=`),
    );
    // The three attributes that make the session survivable: unreadable from JS, not sent
    // on cross-site POSTs, and scoped to the whole app.
    expect(sessionCookie?.toLowerCase()).toContain('httponly');
    expect(sessionCookie?.toLowerCase()).toContain('samesite=lax');
    expect(sessionCookie).toContain('Path=/');

    // The new session should work immediately.
    const me = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { cookie: sessionCookie!.split(';')[0]! },
    });
    const payload = (await me.json()) as { user?: { email?: string } };
    expect(payload.user?.email).toBe(email);
  });

  it('lowercases the email so one address cannot become two accounts', async () => {
    const email = `mixed-${Date.now()}@example.test`;
    createdEmails.push(email);

    const response = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Case Test',
        email: email.toUpperCase(),
        password: 'a-good-long-password',
      }),
    });
    expect(response.status).toBe(201);

    const stored = await testDb.user.findUnique({ where: { email } });
    expect(stored).not.toBeNull();
  });

  it('rejects a duplicate email with a field-level message', async () => {
    const response = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Impostor',
        email: 'asha@example.com',
        password: 'a-good-long-password',
      }),
    });

    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: { fields?: Record<string, string> } };
    expect(payload.error.fields?.email).toBeTruthy();
  });

  it('enforces a minimum password length', async () => {
    const response = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Short', email: 'short@example.test', password: 'abc' }),
    });

    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { fields?: Record<string, string> } };
    expect(payload.error.fields?.password).toBeTruthy();
  });
});

describe('sign-in', () => {
  it('never reveals whether an account exists', async () => {
    /*
     * Both must return the identical message. Distinguishing "no such account" from "wrong
     * password" turns this endpoint into an account-existence oracle, which is how target
     * lists get built before a credential-stuffing run.
     */
    const unknown = await attemptLogin(baseUrl, 'nobody-here@example.test', PASSWORD);
    const wrongPassword = await attemptLogin(baseUrl, 'asha@example.com', 'definitely-wrong');

    expect(unknown.ok).toBe(false);
    expect(wrongPassword.ok).toBe(false);

    /*
     * Identical outcomes, byte for byte. NextAuth puts the failure in the redirect target,
     * so that string is the thing that must not vary — a distinct `code` for either case
     * would rebuild the oracle even though the on-screen message stayed the same.
     */
    expect(unknown.location).toBe(wrongPassword.location);
    expect(unknown.location).not.toContain('nobody-here');
  });

  it('rejects an account that has no password without leaking that fact', async () => {
    /*
     * New with OAuth: a user can exist with passwordHash = null. Returning early for that
     * case would make it measurably faster than a real verification, which is the same
     * oracle by another route — so authorize() burns a dummy hash first.
     */
    const email = `oauthonly-${Date.now()}@example.test`;
    createdEmails.push(email);
    await testDb.user.create({ data: { email, name: 'OAuth Only', passwordHash: null } });

    const attempt = await attemptLogin(baseUrl, email, 'any-password-at-all');
    const unknown = await attemptLogin(baseUrl, `absent-${Date.now()}@example.test`, PASSWORD);

    expect(attempt.ok).toBe(false);
    expect(attempt.location).toBe(unknown.location);
  });

  it('throttles repeated attempts from one caller', async () => {
    /*
     * Ten attempts per fifteen minutes, keyed by caller. Pinned to one address so the bucket
     * actually fills — the helpers otherwise present a distinct address per identity.
     *
     * The rejection must still not say whether the account exists.
     */
    const ip = '203.0.113.99';
    const attempts = [];
    for (let index = 0; index < 12; index += 1) {
      attempts.push(await attemptLogin(baseUrl, 'asha@example.com', 'wrong-password', ip));
    }

    expect(attempts.every((attempt) => !attempt.ok)).toBe(true);
    expect(
      attempts.some((attempt) => attempt.location?.includes('rate_limited')),
      'the eleventh attempt onwards should be throttled',
    ).toBe(true);
  });

  it('rejects a sign-in that carries no CSRF token', async () => {
    /*
     * The double-submit check, which is what a cross-site POST cannot satisfy: an attacker's
     * page can make the browser send the cookie, but cannot read it to echo the token back.
     */
    const response = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'asha@example.com', password: PASSWORD }),
      redirect: 'manual',
    });

    expect(response.headers.get('location')).toContain('MissingCSRF');
    const issued = response.headers.getSetCookie();
    expect(issued.some((raw) => raw.startsWith(`${SESSION_COOKIE_NAME}=`))).toBe(false);
  });

  it('clears the session on sign-out', async () => {
    // sofia is used only here, so signing her out cannot affect another test.
    const cookie = await login('sofia@example.com');
    forgetSession('sofia@example.com');

    const { setCookies } = await signOutWith(baseUrl, cookie);

    const cleared = setCookies.find((raw) => raw.startsWith(`${SESSION_COOKIE_NAME}=`));
    expect(cleared, 'sign-out must clear the session cookie').toBeDefined();
    // It must expire immediately, not merely be blanked.
    expect(cleared).toMatch(/Max-Age=0|Expires=/i);
  });

  it('does not sign out on a GET', async () => {
    /*
     * A GET that destroyed the session would be triggerable by any third-party `<img src>`,
     * signing users out uninvited. NextAuth answers GET with a confirmation page instead, so
     * the property to assert is that the session still works afterwards — not the status.
     */
    const cookie = await login('meera@example.com');

    const response = await fetch(`${baseUrl}/api/auth/signout`, {
      method: 'GET',
      headers: { cookie },
    });
    expect(response.status).toBe(200);

    const after = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } });
    const payload = (await after.json()) as { user?: { email?: string } };
    expect(payload.user?.email).toBe('meera@example.com');
  });
});

describe('account data isolation', () => {
  it('shows each user only their own orders', async () => {
    const [ashaCookie, sofiaCookie] = await Promise.all([
      login('asha@example.com'),
      login('sofia@example.com'),
    ]);

    const fetchOrders = async (cookie: string) => {
      const response = await fetch(`${baseUrl}/api/account/orders`, { headers: { cookie } });
      expect(response.status).toBe(200);
      return (await response.json()) as { items: Array<{ id: string; number: string }> };
    };

    const asha = await fetchOrders(ashaCookie);
    const sofia = await fetchOrders(sofiaCookie);

    const ashaIds = new Set(asha.items.map((order) => order.id));
    for (const order of sofia.items) {
      expect(ashaIds.has(order.id), 'order visible to two different users').toBe(false);
    }

    // Cross-check against the database rather than trusting the API to agree with itself.
    for (const [email, page] of [
      ['asha@example.com', asha],
      ['sofia@example.com', sofia],
    ] as const) {
      const user = await testDb.user.findUnique({ where: { email }, select: { id: true } });
      const owned = await testDb.order.count({ where: { userId: user!.id } });
      expect(page.items.length).toBeLessThanOrEqual(owned);

      for (const order of page.items) {
        const row = await testDb.order.findUnique({
          where: { id: order.id },
          select: { userId: true },
        });
        expect(row?.userId).toBe(user!.id);
      }
    }
  });

  it('makes another user’s order indistinguishable from one that does not exist', async () => {
    /*
     * Both cases must look identical. A 403 for "exists but not yours" confirms the id is real,
     * which is enough to enumerate how many orders the site has and who is buying.
     */
    const owner = await testDb.order.findFirst({
      select: { id: true, user: { select: { email: true } } },
    });
    expect(owner).not.toBeNull();

    const otherUser = await testDb.user.findFirst({
      where: { email: { not: owner!.user.email }, orders: { none: {} } },
      select: { email: true },
    });
    expect(otherUser, 'need a user who owns no orders').not.toBeNull();

    const cookie = await login(otherUser!.email);

    const somebodyElses = await fetch(`${baseUrl}/orders/${owner!.id}`, { headers: { cookie } });
    const fabricated = await fetch(`${baseUrl}/orders/clxq000000000000000000000`, {
      headers: { cookie },
    });

    const [a, b] = await Promise.all([somebodyElses.text(), fabricated.text()]);

    expect(somebodyElses.status).toBe(fabricated.status);
    // Neither may leak any part of the real order.
    expect(a).not.toContain('TS-2026');
    expect(b).not.toContain('TS-2026');
    expect(a).toContain('Page not found');
  });

  it('lets the owner read their own order', async () => {
    const order = await testDb.order.findFirst({
      select: { id: true, number: true, user: { select: { email: true } } },
    });
    const cookie = await login(order!.user.email);

    const response = await fetch(`${baseUrl}/orders/${order!.id}`, { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(order!.number);
  });

  it('marks order pages noindex', async () => {
    const order = await testDb.order.findFirst({
      select: { id: true, user: { select: { email: true } } },
    });
    const cookie = await login(order!.user.email);

    const html = await (
      await fetch(`${baseUrl}/orders/${order!.id}`, { headers: { cookie } })
    ).text();
    // Even if a URL leaks, it must never be indexed.
    expect(html).toContain('noindex');
  });

  it('requires a session for the orders API', async () => {
    const response = await fetch(`${baseUrl}/api/account/orders`);
    expect(response.status).toBe(401);
  });

  it('keeps private responses out of shared caches', async () => {
    const cookie = await login('asha@example.com');
    for (const path of ['/api/account/orders', '/api/account/profile', '/api/auth/session']) {
      const response = await fetch(`${baseUrl}${path}`, { headers: { cookie } });
      expect(response.headers.get('cache-control'), path).toContain('private');
    }
  });
});

describe('profile', () => {
  it('updates the name', async () => {
    const cookie = await login('meera@example.com');
    const original = 'Meera Nair';

    try {
      const response = await fetch(`${baseUrl}/api/account/profile`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: 'Meera Renamed' }),
      });

      expect(response.status).toBe(200);
      const payload = (await response.json()) as { user: { name: string } };
      expect(payload.user.name).toBe('Meera Renamed');
    } finally {
      // Restore, so the seeded fixture is unchanged for other tests and later runs.
      await testDb.user.update({ where: { email: 'meera@example.com' }, data: { name: original } });
    }
  });

  it('ignores fields it does not accept', async () => {
    /*
     * Email is the account identifier; changing it needs a verification step so nobody can
     * claim an address they do not control. The schema drops the field rather than the handler
     * silently ignoring it, so there is one place this is enforced.
     */
    const cookie = await login('dan@example.com');
    const response = await fetch(`${baseUrl}/api/account/profile`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Dan Whitfield', email: 'hijacked@example.test' }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { user: { email: string } };
    expect(payload.user.email).toBe('dan@example.com');
  });

  it('rejects an empty name', async () => {
    const cookie = await login('dan@example.com');
    const response = await fetch(`${baseUrl}/api/account/profile`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: '   ' }),
    });
    expect(response.status).toBe(400);
  });

  it('requires a session', async () => {
    const response = await fetch(`${baseUrl}/api/account/profile`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Nobody' }),
    });
    expect(response.status).toBe(401);
  });
});
