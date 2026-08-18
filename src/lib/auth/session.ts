import { cookies } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';
import { authSecret, isProduction } from '@/lib/env';

/**
 * Session handling: a signed JWT in an httpOnly cookie.
 *
 * Why a cookie and not localStorage: an httpOnly cookie is unreadable from JavaScript, so
 * an XSS payload cannot exfiltrate the session. A token in localStorage is readable by any
 * script on the page, which turns any XSS into full account takeover.
 *
 * The cookie carries `SameSite=Lax`, which stops the browser sending it on cross-site POSTs
 * — the main CSRF vector. Mutating routes additionally check `Sec-Fetch-Site`; see
 * `assertSameOrigin` in lib/api/request.ts.
 *
 * The JWT holds only the user id. Everything else is read from the database per request, so
 * a renamed or deleted user cannot keep acting on a stale token payload.
 */

export const SESSION_COOKIE = 'session';

const ISSUER = 'tender';
const AUDIENCE = 'tender-web';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SessionPayload = {
  userId: string;
};

export async function signSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(authSecret());
}

/**
 * Verify a token. Returns null for anything invalid — expired, tampered, wrong issuer,
 * wrong algorithm — rather than throwing, so a bad cookie logs the user out instead of
 * producing a 500.
 *
 * `algorithms` is pinned deliberately: without it, a token declaring `alg: none` would be
 * accepted, which is the classic JWT forgery.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, authSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });

    if (typeof payload.sub !== 'string' || payload.sub === '') return null;
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

/** Cookie attributes, in one place so every set/clear site agrees. */
function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    // Secure would make the cookie unusable over plain-HTTP localhost in dev.
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export async function createSessionCookie(userId: string): Promise<void> {
  const token = await signSessionToken(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(SESSION_MAX_AGE_SECONDS));
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  // maxAge 0 expires it immediately; the empty value avoids leaving a readable token
  // behind in any intermediate cache.
  store.set(SESSION_COOKIE, '', cookieOptions(0));
}

/** The signed-in user's id, or null. Does not hit the database. */
export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  return payload?.userId ?? null;
}
