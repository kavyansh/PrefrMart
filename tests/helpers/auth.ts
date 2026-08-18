/**
 * Cached sign-in for integration tests.
 *
 * The login endpoint is rate-limited to 10 attempts per 15 minutes per IP, and every test in a
 * file shares one IP. Logging in per assertion exhausts that budget and the suite starts
 * failing with 429s — which is the control working correctly, not a bug to tune away.
 *
 * So each account signs in at most once per file and the cookie is reused. That is also closer
 * to how a session is actually used: obtained once, then carried.
 */

const sessions = new Map<string, string>();

export const DEMO_PASSWORD = 'demo1234';

export async function loginAs(baseUrl: string, email: string): Promise<string> {
  const cached = sessions.get(email);
  if (cached !== undefined) return cached;

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(
      `Sign-in failed for ${email}: ${response.status}. ` +
        'A 429 here means the rate limit was exhausted — check for uncached logins.',
    );
  }

  const cookie = response.headers.get('set-cookie');
  if (cookie === null) throw new Error(`No session cookie returned for ${email}`);

  const pair = cookie.split(';')[0]!;
  sessions.set(email, pair);
  return pair;
}

/** Forget cached sessions — for a test that deliberately signs out. */
export function forgetSession(email: string): void {
  sessions.delete(email);
}
