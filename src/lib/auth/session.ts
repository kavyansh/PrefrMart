import { auth } from '@/lib/auth/config';

/**
 * Session access.
 *
 * NextAuth owns issuing, signing and verifying the session now; what remains here is the
 * narrow question the rest of the app actually asks — "who is this?" — kept behind the same
 * function it has always been behind.
 *
 * That indirection is deliberate. Twenty call sites across pages, route handlers, cart,
 * orders, reviews and checkout depend on this signature. Keeping it means swapping the
 * session implementation touched none of them, and it means the next swap need not either.
 *
 * The JWT still carries only the user id. Everything else is read from the database per
 * request, so a renamed or deleted user cannot keep acting on a stale token payload.
 */

/** The signed-in user's id, or null. Verifies the token; does not hit the database. */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
