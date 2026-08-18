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
import { DEMO_PASSWORD as PASSWORD, forgetSession, loginAs } from './helpers/auth';

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
  it('creates an account and signs the user straight in', async () => {
    const email = `signup-${Date.now()}@example.test`;
    createdEmails.push(email);

    const response = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New Person', email, password: 'a-good-long-password' }),
    });

    expect(response.status).toBe(201);

    const cookie = response.headers.get('set-cookie') ?? '';
    // The three attributes that make the session survivable: unreadable from JS, not sent
    // on cross-site POSTs, and scoped to the whole app.
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
    expect(cookie).toContain('Path=/');

    // The new session should work immediately.
    const me = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { cookie: cookie.split(';')[0]! },
    });
    const payload = (await me.json()) as { user: { email: string } | null };
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
    const unknown = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody-here@example.test', password: PASSWORD }),
    });
    const wrongPassword = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'asha@example.com', password: 'definitely-wrong' }),
    });

    expect(unknown.status).toBe(401);
    expect(wrongPassword.status).toBe(401);

    const a = (await unknown.json()) as { error: { message: string } };
    const b = (await wrongPassword.json()) as { error: { message: string } };
    expect(a.error.message).toBe(b.error.message);
  });

  it('rejects a cross-site sign-in attempt', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
      body: JSON.stringify({ email: 'asha@example.com', password: PASSWORD }),
    });
    expect(response.status).toBe(403);
  });

  it('clears the session on sign-out', async () => {
    // sofia is used only here, so signing her out cannot affect another test.
    const cookie = await login('sofia@example.com');
    forgetSession('sofia@example.com');

    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(logout.status).toBe(200);

    // The cleared cookie must expire immediately, not merely be blanked.
    const cleared = logout.headers.get('set-cookie') ?? '';
    expect(cleared).toMatch(/Max-Age=0|Expires=/i);
  });

  it('refuses sign-out over GET', async () => {
    // A GET logout is triggerable by any third-party <img src>, signing users out uninvited.
    const response = await fetch(`${baseUrl}/api/auth/logout`, { method: 'GET' });
    expect(response.status).toBe(405);
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
    for (const path of ['/api/account/orders', '/api/account/profile', '/api/auth/me']) {
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
