# Tender — mobile-first e-commerce demo

A self-contained Amazon-style storefront built with Next.js 16 (App Router), React 19,
TypeScript, Tailwind v4 and Prisma over local SQLite.

No external services, no API keys, no payment provider. Everything — catalog, users,
reviews, orders, product art — is generated locally from a fixed seed, so the demo runs
fully offline and reproduces identically on any machine.

## Quick start

```bash
npm install
cp .env.example .env          # then set AUTH_SECRET (see below)
npm run gen:images               # writes public/img/p/*.svg
npm run db:migrate               # creates prisma/dev.db
npm run db:seed                  # ~500 products, 2.7k reviews, 65 users, 6 orders
npm run dev                      # http://localhost:3000
```

Generate a real `AUTH_SECRET` — the app refuses to boot with the placeholder:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Demo sign-in

| Email | Password |
|---|---|
| `asha@example.com` | `demo1234` |
| `ravi@example.com` | `demo1234` |
| `meera@example.com` | `demo1234` |
| `dan@example.com` | `demo1234` |
| `sofia@example.com` | `demo1234` |

The seed also creates 60 review-only accounts so rating counts look realistic. They
share the same password but are not intended as sign-in accounts.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run verify` | typecheck → lint → unit tests → build → bundle budget |
| `npm test` | Vitest unit tests |
| `npm run lint` | ESLint (incl. `jsx-a11y`) |
| `npm run db:reset` | Drop, re-migrate and re-seed |
| `npm run gen:images` | Regenerate placeholder product art |
| `npm run check:bundle` | Measure real gzipped first-load JS per route |

## Architecture notes

**Cursor pagination.** `src/lib/pagination.ts` produces opaque base64url cursors and
over-fetches by one row to detect the next page. Every paginated sort ends in `id` as a
tiebreaker, which changes the SQL Prisma emits — a compound keyset predicate instead of a
range scan with `OFFSET 1`. The `ORDER_BY` block in `src/lib/catalog/products.ts` records
both generated forms and why the second is only accidentally correct on SQLite. A tampered
or stale cursor degrades to page one rather than erroring.

**Infinite scroll.** `src/hooks/useCursorPagination.ts` drives it from an
IntersectionObserver with a 600px prefetch margin, and snapshots loaded pages into
sessionStorage keyed by the filter set — so opening a product and pressing back returns you
to where you were instead of the top of page one. A real "Load more" button is always
rendered: the observer is an enhancement, and someone navigating by keyboard or screen
reader never scrolls a sentinel into view.

**Filters live in the URL.** Applying a filter is a navigation, so listings are shareable
and bookmarkable, reload keeps them, and the back button undoes them — with no client
filter state that can drift from the results on screen.

**Money.** Always integer minor units (paise). `src/lib/money.ts` is the single source of
truth for order arithmetic, so a client cannot talk the server into a different total.

**Rating aggregates.** `Product.ratingAvg` / `ratingCount` are denormalised deliberately
and recomputed in the same transaction that writes a review, so listing pages never need
a per-card aggregate query.

**Prisma 7.** The connection URL lives in `prisma.config.ts` (for migrate) and reaches
`PrismaClient` through the `better-sqlite3` driver adapter — Prisma 7 removed `url` from
the schema's `datasource` block.

**Reviews.** One per user per product, enforced by a `@@unique([productId, userId])`
constraint — the pre-check is racy by nature, so a unique violation is caught and turned into
the same clean 409. Writing a review and recomputing the product's aggregates happen in one
transaction, and the average is re-derived from an aggregate query rather than nudged, so a
transient failure cannot leave it permanently skewed.

**Security.** A per-request nonce CSP is set in `src/proxy.ts` (Next 16's rename of
`middleware.ts`); static headers are in `next.config.ts`. Sessions are HS256 JWTs in an
httpOnly cookie — unreadable from JavaScript, so an XSS payload cannot exfiltrate one, which a
token in localStorage would not survive. Verification pins `algorithms: ['HS256']`, without
which an `alg: none` token forges a session. Passwords use `node:crypto` scrypt with per-user
salts and constant-time comparison. `react/no-danger` is an ESLint error project-wide, with a
single scoped exemption in `components/seo/JsonLd.tsx`. Every route handler parses its input
through a Zod schema before touching the database.

**CSRF.** `SameSite=Lax` plus an origin check on every mutating route. Note the check compares
`Origin` against the `Host` header, **not** `request.nextUrl.origin` — measured on Next 16.3.1,
that property is normalised to `http://localhost:<port>` regardless of the host the request
arrived on, so comparing against it rejects legitimate same-origin requests and breaks every
form behind a proxy or real hostname. See `src/lib/api/request.ts`.

**Login does not leak which accounts exist.** Unknown email and wrong password return the same
message, and the unknown-email path still spends a scrypt verification against a throwaway
hash — otherwise response time alone answers "is this address registered?", which is how
target lists get built before a credential-stuffing run. Sign-up hashes the password *before*
checking for a duplicate, for the same reason.

**Route guards.** `src/proxy.ts` redirects unauthenticated requests to `/account`, `/checkout`
and `/orders` to sign-in, carrying the destination so signing in resumes the journey. The guard
verifies the JWT signature only — no database hit, so it stays Edge-safe — and the pages
re-check with `getCurrentUser()`, which is what catches a valid token for a since-deleted user.

**Open redirect.** The post-login `next` parameter is sanitised in
`src/lib/auth/redirect.ts`: root-relative paths only, with protocol-relative (`//evil.example`),
backslash (`/\evil.example`) and control-character forms all rejected. Without this, a link from
our own sign-in flow can deposit a user on a look-alike page an attacker controls.

**Account data isolation.** Every function in `src/lib/orders/queries.ts` takes a `userId` and
scopes on it — that is the authorisation boundary, not a convenience. There is deliberately no
`getOrderById(id)` for a caller to reach for by mistake. Another user's order id is
indistinguishable from one that does not exist: a 403 for "exists but not yours" would confirm
the id is real, which is enough to enumerate the site's order volume.

### Why every page is `force-dynamic`

This one is worth knowing before you "optimise" it back.

Next stamps the CSP nonce onto its scripts — including four **inline** React hydration
scripts — only for dynamically rendered responses. A statically prerendered or ISR page's
HTML predates the request, so it carries no nonce. And because `'strict-dynamic'` makes
browsers ignore the `'self'` host source, *every script on such a page is blocked*: the
HTML looks perfect and the page is dead in a browser.

The only way to keep ISR would be `script-src 'unsafe-inline'`, which is exactly the hole
that makes injected `<script>` executable — i.e. it would trade away the XSS protection
the requirement asks for.

So pages render per request. The cost is small: the catalog query is indexed and local, a
few milliseconds against a 2.5s LCP target. `tests/security.test.ts` asserts that every
script on every HTML route carries the request nonce, so making a page static fails the
build rather than silently shipping a blank page. Add new page routes to `HTML_ROUTES`
in that file.

### The 404 status, and why it is set in the proxy

`notFound()` renders the right page but leaves the status at **200** on a streamed response
in Next 16.3.1. Verified: even a synchronous `notFound()` in a static route returns 200, and
neither `generateStaticParams` + `dynamicParams = false` nor reordering the `await`s changes
it. A soft 404 tells crawlers a broken URL is a real page and hides dead links from uptime
monitoring.

The proxy runs before rendering, so that is where the status can still be set — see
`notFoundStatus()` in `src/proxy.ts`. The page still calls `notFound()` to render the body.
Guarded by `tests/security.test.ts`.

### Known `npm audit` finding

`npm audit` reports 3 high-severity issues, all one advisory: `deepmerge-ts <8.0.0`
(stack exhaustion on recursive object graphs). The only path to it is:

```
prisma (devDependency, CLI) → @prisma/config → deepmerge-ts
```

It is build-tooling only — never part of the runtime bundle — and the sole object the CLI
merges is our own static `prisma.config.ts`, not untrusted input. `npm audit fix --force`
would downgrade to `prisma@6.12`, which breaks the Prisma 7 schema and adapter setup.
Left as-is deliberately; revisit when Prisma bumps the dependency.

## Product images

Product art is **generated SVG placeholders**, not photography — deterministic gradients
plus a category glyph, a few hundred bytes each. That keeps the demo offline-capable and
inside the byte budget. `imageSrc()` in `src/lib/catalog/taxonomy.ts` is the single place
to swap in real images.

## Performance: the bundle budget, honestly

The original target was 150 KB first-load JS. **Measured, the Next 16 + React 19 App
Router baseline is 138.8 KB gzipped before a single line of application code.** The 150 KB
figure is therefore not reachable with this framework, and pretending otherwise would make
the budget check meaningless.

`npm run check:bundle` boots the production server, fetches each route, and gzips exactly the
scripts a modern browser would execute — it excludes Next's ~39 KB `noModule` core-js
bundle, which modern browsers skip, since counting it would overstate real cost. It reports
two numbers and fails on either:

- **total first-load JS** — budget 185 KB (framework floor + working margin)
- **app code above the floor** — budget 45 KB, the number that reflects our own work

App code is measured against the recorded floor, not against chunks the routes have in
common: when every route loads the same client bundle, an intersection reports 0 KB no
matter how large that bundle grows.

This check has already earned its keep twice. It caught **the whole of zod (70 KB gzipped)
being pulled into the browser** because `lib/catalog/query.ts` imported one const array
from `lib/validation/schemas.ts`, which imports zod — hence the dependency-free
`lib/catalog/sorts.ts`. And it showed Radix Dialog costing 11.7 KB for modal behaviour the
native `<dialog>` element provides for free, so `Sheet` uses `showModal()` instead and the
dependency is gone. Phase 2's entire interactive surface — infinite scroll, filters, sort,
mobile sheet — costs **7.9 KB**.

If the hard 150 KB total matters more than the framework, that is a framework decision
(Astro/SvelteKit with islands would clear it), not something tuning can reach.

### Known limitation: soft 404 on unknown product and order URLs

`/c/<unknown>` returns a real 404 because the category slugs are a closed static set the Edge
proxy can check. `/p/<unknown>` and `/orders/<unknown>` return the correct "Page not found" body
with **HTTP 200**, because those ids are not a closed set and `ProxyConfig` in Next 16.3.1 has no
`runtime` option — the proxy is Edge-only and cannot reach Prisma.

Deliberately not worked around: hardcoding 504 slugs into the proxy would not survive a real
catalog, and an internal HEAD request per page view doubles the request count to fix a status
code. Revisit when `notFound()` sets the status, or when the proxy can run on Node.

Note this is cosmetic, not a security gap. The *content* is correct, and for orders the property
that matters holds: another user's order and a fabricated id return byte-identical responses, so
nothing is leaked by the status being wrong. Asserted in `tests/auth.integration.test.ts`.

### Tests run serially, on purpose

`vitest.config.ts` sets `fileParallelism: false`. The integration suites share one SQLite file,
and in parallel they interfere in ways that look like product bugs — the reviews suite writing a
review changes a product's `ratingAvg`, which shifts the keyset window the pagination suite is
walking under `sort=rating`, so a row gets skipped. Observed exactly that. The unit tests run in
~100ms, so serialising costs almost nothing.

Integration tests also cache sign-ins per account (`tests/helpers/auth.ts`). The login endpoint
is rate-limited to 10 attempts per 15 minutes per IP, and a suite that signs in per assertion
exhausts that budget and starts failing with 429s — which is the control working, not something
to tune away.

## Status

**Phases 1-4 of 6 complete.** 192 tests.

- **P1** — foundation, Prisma schema, deterministic seed, design tokens, cursor pagination,
  nonce CSP, product listing API, verification harness.
- **P2** — product listing pages (home and category) with cursor-driven infinite scroll,
  URL-based filters and sort, mobile filter sheet and desktop rail, skeleton/empty/error
  states, back-navigation restore, real 404s.
- **P3** — product detail page: gallery, price, stock, specs, rating distribution, related
  products, `Product` JSON-LD. Cursor-paginated sortable reviews and a review form gated on
  auth. Session handling, login/logout/me endpoints, CSRF origin checks and rate limiting.
- **P4** — sign-in and sign-up pages sharing one form, route guards with post-login resume and
  open-redirect protection, settings shell with a desktop rail and mobile sheet, profile
  editing, cursor-paginated order history, and order detail with snapshotted address and
  totals.

**Not yet wired: add to cart.** The PDP shows price, stock and delivery but no cart button —
the cart is Phase 5, and a control that does nothing is worse than an absent one.

Not yet built: cart and checkout (P5), search, offline/PWA and the a11y pass (P6).

**Deliberately out of scope:** voice commands, and real image-similarity search — the
image search shipping in Phase 6 is a labelled stub behind `lib/search/imageStub.ts`.
