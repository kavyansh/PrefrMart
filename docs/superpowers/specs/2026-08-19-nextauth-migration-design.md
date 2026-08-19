# Migrating auth to NextAuth v5, with Google and GitHub sign-in

Status: proposed
Date: 2026-08-19

## Goal

Add OAuth sign-in (Google, GitHub) to the storefront by replacing the hand-rolled session
layer with NextAuth v5. OAuth is the driver: it is the one thing the current implementation
cannot do. Everything else in this document exists to make that addition without losing
security properties the current code establishes deliberately.

## Decisions

| Decision | Choice | Consequence |
|---|---|---|
| Motivation | Social login | Prisma adapter required; new tables |
| Offline demo | OAuth keys are **required** env vars | README's "runs fully offline" claim is retired |
| Version | `next-auth@5.0.0-beta.32` (exact pin) | App Router-native; accepts beta risk |
| Email collision | Reject (NextAuth default) | No `allowDangerousEmailAccountLinking` |

The offline decision was taken with the trade-off stated: `.env.example` currently needs only
a generated `AUTH_SECRET`, and a fresh clone runs with no third-party account anywhere. After
this change every contributor must register their own Google and GitHub OAuth applications
before `npm run dev` will boot.

## Verified API facts

Checked against the published tarballs rather than recalled, because v5's API has moved
between betas and most published tutorials are wrong for beta.32.

- `NextAuth()` returns `{ handlers, auth, signIn, signOut }`; `handlers` is an
  `AppRouteHandlers` pair — `index.d.ts:85-105`.
- `auth` is overloaded to accept a proxy handler and return a `NextMiddleware`, so
  `export default auth((req) => …)` is supported — `index.d.ts:107`.
- `authorize(credentials, request)` receives the original request as its second argument, so
  the existing IP-keyed rate limiting ports across unchanged — `credentials.d.ts:45`.
- `allowDangerousEmailAccountLinking` exists on OAuth providers and defaults to false, which
  is exactly the reject-on-collision behaviour chosen above — `oauth.d.ts:157-160`.
- `next-auth@5.0.0-beta.32` depends on `@auth/core@0.41.3` (exact).
- `@auth/prisma-adapter@2.11.3` declares `@prisma/client: >=6`, which `7.9.1` satisfies. The
  adapter does not name Prisma 7 explicitly, so treat adapter behaviour as unverified until
  the integration suite passes.

## Architecture

### Keep the facade, swap the engine

`getSessionUserId()` and `getCurrentUser()` keep their exact signatures and become thin
wrappers over NextAuth's `auth()`. There are 20 call sites across pages, route handlers, cart,
orders, reviews and checkout; none of them change.

This is the whole reason to prefer it over the "idiomatic" rewrite. The alternative — calling
`await auth()` at every site and deleting both helpers — is a 20-file diff with no behavioural
gain, and pulls `SessionProvider` into the client tree against a 45 KB app-code budget that
`check:bundle` enforces as a hard gate.

The authorisation boundary stays where it is: every function in `lib/orders/queries.ts` takes
a `userId` and scopes on it. NextAuth changes who issues the session, not who may read a row.

### Session strategy

JWT, not database sessions. This is forced rather than chosen: NextAuth's Credentials provider
does not support database sessions. The adapter is still required, because OAuth users must be
persisted — `Order`, `Review`, `Cart` and `Address` all carry a foreign key to `User`.

## Schema changes

One migration:

- `User.passwordHash` becomes **nullable**. A user who only ever signs in with Google has no
  password. Every read of this column must handle null.
- `User.emailVerified DateTime?` and `User.image String?` — required by the Auth.js adapter
  contract.
- New `Account` model, with `@@unique([provider, providerAccountId])`.
- New `Session` and `VerificationToken` models. **These are never written at runtime** under
  the JWT strategy; they exist because `@auth/prisma-adapter` references `prisma.session` and
  `prisma.verificationToken` and will not typecheck without them. They must be commented as
  such so they do not read as load-bearing.

The seed keeps writing `passwordHash` for all 65 users. Existing scrypt hashes are untouched
and keep verifying — the hash format and parameters do not change.

## Files

### New

- `src/lib/auth/config.ts` — providers, adapter, `session: { strategy: 'jwt' }`,
  `pages: { signIn: '/login' }`, and jwt/session callbacks placing `userId` on the session.
- `src/app/api/auth/[...nextauth]/route.ts` — `export const { GET, POST } = handlers`.

### Changed

- `src/lib/auth/session.ts` — `signSessionToken`/`verifySessionToken`/`createSessionCookie`/
  `clearSessionCookie` are deleted. `getSessionUserId()` remains, backed by `auth()`.
- `src/lib/auth/currentUser.ts` — unchanged signature; resolves via the new `getSessionUserId`.
- `src/proxy.ts` — becomes `export default auth((req) => …)`, reading `req.auth`. **The CSP
  nonce block and `notFoundStatus()` are preserved verbatim**; they are unrelated to auth and
  the wrapper composes around them.
- `src/lib/env.ts` — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`,
  `GITHUB_CLIENT_SECRET` join `AUTH_SECRET` as required. NextAuth v5 reads `AUTH_SECRET`
  natively, so that variable keeps its name and meaning.
- `src/components/auth/AuthForm.tsx` — `signIn('credentials', { redirect: false })` plus
  Google and GitHub buttons. No `SessionProvider`: `signIn`/`signOut` work standalone.
- `src/components/account/LogoutButton.tsx` — `signOut()`.
- `.env.example`, `README.md` — new variables; the offline and Security sections rewritten.

### Deleted

`src/app/api/auth/login/route.ts`, `logout/route.ts`, `me/route.ts` — superseded by NextAuth's
`signin`, `signout` and `session` endpoints. No path collision exists (NextAuth uses
`signin`/`signout`/`session`/`csrf`/`callback`), so these are removed for coherence, not
necessity: two sign-in paths would mean two sources of truth.

### Retained

`src/app/api/auth/signup/route.ts` **stays**. NextAuth has no registration flow for
credentials — creating the user is the application's job. It keeps its rate limit, its Zod
schema, and its hash-before-duplicate-check ordering.

It no longer establishes the session itself: `createSessionCookie()` is gone, so the route
creates the user and returns 201, and the client then calls `signIn('credentials', …)` with
the same values. Sign-up therefore becomes two round-trips instead of one — accepted, because
the alternative is issuing a session cookie NextAuth did not mint and would not recognise.

## Security properties to preserve

Each of these is currently deliberate and tested. The migration must carry each one across.

| Property | Today | After |
|---|---|---|
| One message for unknown email and wrong password | `login/route.ts` | `authorize()` returns null for both |
| Timing equalised on the unknown-account path | dummy scrypt hash | same dummy hash in `authorize()` |
| **New:** OAuth-only user (null `passwordHash`) must also burn a dummy hash | n/a | `authorize()` — otherwise nullable passwords become the new enumeration oracle |
| Per-IP rate limit on sign-in | `rateLimit` + `callerKey` | same, via `authorize`'s `request` argument |
| Sign-out is POST-only | `logout/route.ts` | NextAuth `signout` is POST |
| Session cookie httpOnly + SameSite=Lax | `cookieOptions()` | NextAuth default; assert in tests |
| Open-redirect sanitisation of `next` | `lib/auth/redirect.ts` | retained; feeds `redirectTo` |
| CSRF on mutating routes | `isSameOrigin()` | retained for non-NextAuth routes; NextAuth brings its own token |
| No account-existence oracle via error codes | n/a | **Do not** subclass `CredentialsSignin` with distinct codes. v5 puts the custom `code` in the redirect URL, which would rebuild the oracle. |

## Testing

- `tests/auth.integration.test.ts` is rewritten against the new plumbing, asserting the same
  properties: non-enumeration, CSRF rejection, forged-cookie rejection, sign-out clearing the
  session, account data isolation, `noindex` on order pages, private cache headers.
- New case: an OAuth sign-in whose email already has a password account is rejected, and the
  sign-in page renders a message directing the user to their password.
- `src/lib/auth/session.test.ts` is deleted — it tests token forgery paths NextAuth now owns —
  and replaced by unit tests for `authorize()` covering: unknown email, wrong password, null
  `passwordHash`, and rate-limit exhaustion.
- A `test.env` block in `vitest.config.ts` injects dummy OAuth client IDs and secrets, so
  `npm test` and `npm run verify` never require real credentials on any machine. The
  integration suites boot the real server via `tests/helpers/server.ts`, which inherits
  `process.env`, so the values must be set there rather than in an individual test file.
  Sign-in through a live provider is not exercised; only that the app boots and that the
  credentials path and the rejection path behave.
- `tests/security.test.ts` is unchanged but is the gate that matters most: it asserts every
  script on every HTML route carries the request nonce.

## Risks

1. **CSP × NextAuth.** The `'strict-dynamic'` nonce policy is strict, and every page must stay
   dynamically rendered or its scripts are blocked outright. NextAuth should inject no inline
   script once `pages.signIn` points at our own page, but this is unproven. `security.test.ts`
   is the first thing to run after the proxy change, not the last.
2. **Beta churn.** beta.32's API differs from earlier betas. Work from the installed package's
   types; treat online examples as unreliable.
3. **Prisma 7 × adapter.** The adapter does not name Prisma 7 in its peer range. If it breaks,
   the fallback is a hand-written adapter implementing the six methods JWT-strategy OAuth
   actually uses.
4. **Bundle budget.** `next-auth/react` adds client JS to the auth pages and `LogoutButton`.
   `/login` currently sits exactly at the framework floor (138.8 KB) with 45 KB of headroom.

## Out of scope

- Email/passwordless sign-in, WebAuthn, MFA.
- Linking a provider from the profile page after sign-in (rejected in favour of the simpler
  reject-on-collision behaviour; revisit if users hit it).
- Replacing the in-memory rate limiter with a shared store. It remains per-process and
  demo-grade, as documented.
- The `MAX_PERSISTED_ITEMS` cursor bug in `useCursorPagination` — unrelated, tracked separately.
