import type { NextRequest } from 'next/server';
import { apiError, guarded, ok } from '@/lib/api/response';
import { isSameOrigin } from '@/lib/api/request';
import { clearSessionCookie } from '@/lib/auth/session';

/**
 * POST /api/auth/logout
 *
 * POST rather than GET: a GET would be triggerable by any `<img src>` on a third-party page,
 * logging users out uninvited.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return guarded('auth.logout', async () => {
    if (!isSameOrigin(request)) {
      return apiError('forbidden', 'Cross-origin requests are not allowed.');
    }

    // Unconditional: signing out when already signed out is a success, not an error.
    await clearSessionCookie();
    return ok({ ok: true });
  });
}
