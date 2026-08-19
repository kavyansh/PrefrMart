import { PrismaAdapter } from '@auth/prisma-adapter';
import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import { verifyPassword } from '@/lib/auth/password';
import { db } from '@/lib/db';
import { githubOAuth, googleOAuth } from '@/lib/env';
import { callerKey, rateLimit } from '@/lib/rateLimit';
import { credentialsSchema } from '@/lib/validation/schemas';

/**
 * NextAuth configuration — the single source of truth for who is signed in.
 *
 * Sessions are JWTs in an httpOnly cookie, as before. That is forced rather than preferred:
 * the Credentials provider does not support database sessions. The Prisma adapter is still
 * required, because an OAuth user has to exist as a `User` row — `Order`, `Review`, `Cart`
 * and `Address` all carry a foreign key to it.
 *
 * Account linking is left at the default: an OAuth sign-in whose email already belongs to a
 * password account is REJECTED with `OAuthAccountNotLinked`. Setting
 * `allowDangerousEmailAccountLinking` would mean anyone who can obtain an OAuth account at a
 * victim's address inherits that victim's order history.
 */

const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };

/**
 * A structurally valid scrypt hash that no password matches. Used only to spend comparable
 * time on paths that have no real hash to check; its plaintext is irrelevant.
 */
const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

/**
 * Distinguished from a bad password on purpose, and safely: being throttled says nothing
 * about whether the account exists, so surfacing it leaks nothing while telling the user
 * something actionable.
 *
 * No other custom code is permitted here. NextAuth puts `code` in the redirect URL, so
 * separate codes for "no such account" and "wrong password" would hand back exactly the
 * account-existence oracle the single shared message exists to deny.
 */
class RateLimitedSignin extends CredentialsSignin {
  override code = 'rate_limited';
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),

  // Self-hosted: without this, Auth.js rejects every request with UntrustedHost because it
  // cannot confirm the host it is being served under.
  trustHost: true,

  session: { strategy: 'jwt' },

  // Our own pages, not the built-in ones — which also keeps the nonce CSP intact, since
  // Auth.js's default pages are not rendered through our layout.
  pages: { signIn: '/login', error: '/login' },

  providers: [
    Google(googleOAuth()),
    GitHub(githubOAuth()),
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },

      /**
       * Returns null for every failure. NextAuth collapses that into one undifferentiated
       * `CredentialsSignin`, which is what keeps unknown-email and wrong-password
       * indistinguishable to a caller.
       */
      async authorize(rawCredentials, request) {
        // Pre-authentication there is no user identity to key on, so throttle by IP. This is
        // the endpoint worth throttling.
        const limited = rateLimit({ key: callerKey(request, 'login'), ...LOGIN_RATE_LIMIT });
        if (!limited.allowed) throw new RateLimitedSignin();

        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
          select: { id: true, email: true, name: true, passwordHash: true },
        });

        /*
         * Two cases collapse into one here, and both must cost what a real verification
         * costs: no such account, and an account that exists but has only ever signed in
         * with Google. Returning early for either makes response time answer a question we
         * refuse to answer directly — the second case is new with OAuth and would otherwise
         * reintroduce the oracle through the back door.
         */
        if (user === null || user.passwordHash === null) {
          await verifyPassword(parsed.data.password, DUMMY_HASH);
          return null;
        }

        const valid = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],

  callbacks: {
    /*
     * The JWT carries the user id in `sub` and nothing else, exactly as the hand-rolled
     * session did. Everything else is read from the database per request, so a renamed or
     * deleted user cannot keep acting on a stale payload.
     */
    session({ session, token }) {
      if (session.user && typeof token.sub === 'string') {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
