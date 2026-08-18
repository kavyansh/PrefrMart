import { guarded, ok } from '@/lib/api/response';
import { getCurrentUser } from '@/lib/auth/currentUser';

/** GET /api/auth/me — the signed-in user, or null. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return guarded('auth.me', async () => {
    const user = await getCurrentUser();
    return ok(
      { user },
      // Per-user: must never land in a shared cache.
      { headers: { 'cache-control': 'private, no-store' } },
    );
  });
}
