import type { NextRequest } from 'next/server';
import { apiError, guarded, ok, validationError } from '@/lib/api/response';
import { isSameOrigin } from '@/lib/api/request';
import { hashPassword } from '@/lib/auth/password';
import { db } from '@/lib/db';
import { callerKey, rateLimit } from '@/lib/rateLimit';
import { signupSchema } from '@/lib/validation/schemas';

/**
 * POST /api/auth/signup — create an account.
 *
 * Kept after the move to NextAuth because NextAuth has no registration flow for credentials:
 * creating the user is the application's job. It deliberately does NOT establish the session
 * — issuing a cookie NextAuth did not mint would not be recognised by it. The client calls
 * `signIn('credentials', …)` with the same values once this returns, so sign-up costs two
 * round-trips.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGNUP_RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };

export async function POST(request: NextRequest) {
  return guarded('auth.signup', async () => {
    if (!isSameOrigin(request)) {
      return apiError('forbidden', 'Cross-origin requests are not allowed.');
    }

    const limited = rateLimit({ key: callerKey(request, 'signup'), ...SIGNUP_RATE_LIMIT });
    if (!limited.allowed) {
      return apiError('rate_limited', 'Too many sign-up attempts. Try again later.');
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return apiError('bad_request', 'Expected a JSON body.');
    }

    const parsed = signupSchema.safeParse(payload);
    if (!parsed.success) return validationError(parsed.error);

    const { email, name, password } = parsed.data;

    /*
     * Hash before checking for a duplicate, deliberately. Doing the cheap existence check
     * first makes "email already registered" measurably faster than "email is free", which
     * turns this endpoint into an account-existence oracle for anyone with a stopwatch.
     */
    const passwordHash = await hashPassword(password);

    try {
      const user = await db.user.create({
        data: { email, name, passwordHash },
        select: { id: true, email: true, name: true },
      });

      return ok({ user }, { status: 201 });
    } catch (error) {
      /*
       * The unique constraint on email is the real guard — a pre-check would be racy, and two
       * simultaneous sign-ups with the same address would both pass it.
       *
       * This does reveal that the address is taken, which is unavoidable: the user has to be
       * told they cannot register it. The mitigation that matters is that *login* stays
       * silent about it (see the login route), so this cannot be used to test a list of
       * addresses at scale — the rate limit above is the other half.
       */
      if (isUniqueViolation(error)) {
        return apiError('conflict', 'An account with that email already exists.', {
          email: 'That email is already registered.',
        });
      }
      throw error;
    }
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
