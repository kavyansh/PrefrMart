import { db } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth/session';

/**
 * Resolve the signed-in user from the database.
 *
 * Kept apart from session.ts so the Edge-safe token logic has no Prisma import, and so a
 * caller that only needs "is anyone signed in" does not pay for a query.
 *
 * A valid token for a deleted user resolves to null: the session is only as good as the
 * row it points at.
 */

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const userId = await getSessionUserId();
  if (userId === null) return null;

  return db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });
}
