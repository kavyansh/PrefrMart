import type { NextRequest } from 'next/server';
import { apiError, guarded, ok, validationError } from '@/lib/api/response';
import { isSameOrigin } from '@/lib/api/request';
import { verifyPassword } from '@/lib/auth/password';
import { createSessionCookie } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { callerKey, rateLimit } from '@/lib/rateLimit';
import { credentialsSchema } from '@/lib/validation/schemas';

/**
 * POST /api/auth/login
 *
 * Built in Phase 3 because the review endpoint needs a way to identify the caller, and
 * without a way to sign in there is no way to exercise or verify it. The sign-in UI, route
 * guards and settings pages are Phase 4.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };

export async function POST(request: NextRequest) {
  return guarded('auth.login', async () => {
    if (!isSameOrigin(request)) {
      return apiError('forbidden', 'Cross-origin requests are not allowed.');
    }

    // Keyed by IP: pre-authentication there is no user identity to key on, and this is
    // exactly the endpoint worth throttling.
    const limited = rateLimit({ key: callerKey(request, 'login'), ...LOGIN_RATE_LIMIT });
    if (!limited.allowed) {
      return apiError('rate_limited', 'Too many sign-in attempts. Try again shortly.');
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return apiError('bad_request', 'Expected a JSON body.');
    }

    const parsed = credentialsSchema.safeParse(payload);
    if (!parsed.success) return validationError(parsed.error);

    const user = await db.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, email: true, name: true, passwordHash: true },
    });

    /*
     * One message for both "no such account" and "wrong password", deliberately.
     * Distinguishing them turns this endpoint into an account-existence oracle, which is
     * how attackers build target lists before a credential-stuffing run.
     *
     * The timing side-channel is narrower but real: returning early for an unknown email
     * skips the ~100ms scrypt verification, so response time leaks whether the account
     * exists. Hashing against a throwaway value keeps the two paths comparable.
     */
    if (user === null) {
      await verifyPassword(parsed.data.password, DUMMY_HASH);
      return apiError('unauthorized', 'That email or password is not correct.');
    }

    const valid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!valid) {
      return apiError('unauthorized', 'That email or password is not correct.');
    }

    // Issued fresh on every login, so a previously captured token is not extended.
    await createSessionCookie(user.id);

    return ok({ user: { id: user.id, email: user.email, name: user.name } });
  });
}

/*
 * A structurally valid scrypt hash that no password matches. Used only to spend comparable
 * time on the unknown-account path; its plaintext is irrelevant.
 */
const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
