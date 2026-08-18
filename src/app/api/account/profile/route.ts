import type { NextRequest } from 'next/server';
import { apiError, guarded, ok, validationError } from '@/lib/api/response';
import { isSameOrigin } from '@/lib/api/request';
import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { updateProfileSchema } from '@/lib/validation/schemas';

/** GET / PATCH /api/account/profile */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return guarded('account.profile.get', async () => {
    const userId = await getSessionUserId();
    if (userId === null) return apiError('unauthorized', 'Sign in to view your profile.');

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    if (user === null) return apiError('unauthorized', 'Your session is no longer valid.');

    return ok({ user }, { headers: { 'cache-control': 'private, no-store' } });
  });
}

export async function PATCH(request: NextRequest) {
  return guarded('account.profile.patch', async () => {
    if (!isSameOrigin(request)) {
      return apiError('forbidden', 'Cross-origin requests are not allowed.');
    }

    const userId = await getSessionUserId();
    if (userId === null) return apiError('unauthorized', 'Sign in to update your profile.');

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return apiError('bad_request', 'Expected a JSON body.');
    }

    const parsed = updateProfileSchema.safeParse(payload);
    if (!parsed.success) return validationError(parsed.error);

    /*
     * Only the name is editable. Email is the account identifier and changing it needs a
     * verification flow to stop someone claiming an address they do not control; password
     * changes need the current password. Neither is in scope, so neither is accepted here —
     * rather than accepted and silently ignored, which would be worse.
     */
    const user = await db.user.update({
      where: { id: userId },
      data: { name: parsed.data.name },
      select: { id: true, email: true, name: true },
    });

    return ok({ user });
  });
}
