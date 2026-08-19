# PrefrMart — mobile-first e-commerce demo 

<img width="3418" height="1994" alt="image" src="https://github.com/user-attachments/assets/aff1cf80-5836-4d00-88c9-84cc7aaaa14c" />


A self-contained Amazon-style storefront built with Next.js 16 (App Router), React 19,
TypeScript, Tailwind v4 and Prisma over local SQLite.

No payment provider. The catalog, users, reviews, orders and product art are all generated
locally from a fixed seed, so the data reproduces identically on any machine.

Sign-in is the one exception, and it is deliberate. Alongside email and password, the app
offers Google and GitHub through NextAuth, so **`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are required** and the app refuses to boot
without them. A clone no longer runs with no third-party account anywhere; you need to
register two OAuth applications first. Email and password sign-in still works entirely
locally once it boots.

## Quick start

```bash
npm install
cp .env.example .env          # then fill in AUTH_SECRET and the OAuth keys (see below)
npm run gen:images               # writes public/img/p/*.svg
npm run db:migrate               # creates prisma/dev.db
npm run db:seed                  # ~500 products, 2.7k reviews, 65 users, 6 orders
npm run dev                      # http://localhost:3000
```

Generate a real `AUTH_SECRET` — the app refuses to boot with the placeholder:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### OAuth applications

Both are required. Register them once and paste the credentials into `.env`:

| Provider | Where | Callback URL |
|---|---|---|
| Google | [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) | `http://localhost:3000/api/auth/callback/google` |
| GitHub | [github.com/settings/developers](https://github.com/settings/developers) | `http://localhost:3000/api/auth/callback/github` |

The test suite supplies its own dummy values (see `vitest.config.ts`), so `npm test` and
`npm run verify` never need real credentials.

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
| `npm run check:a11y` | Colour-contrast and page-structure audit (diagnostic, not a gate) |

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
`middleware.ts`); static headers are in `next.config.ts`. Sessions are JWTs in an httpOnly
cookie issued by NextAuth — unreadable from JavaScript, so an XSS payload cannot exfiltrate
one, which a token in localStorage would not survive. The token carries only the user id;
everything else is read from the database per request, so a renamed or deleted user cannot
act on a stale payload. Passwords still use `node:crypto` scrypt with per-user salts and
constant-time comparison, and existing hashes were not migrated — the format is unchanged.
`react/no-danger` is an ESLint error project-wide, with a single scoped exemption in
`components/seo/JsonLd.tsx`. Every route handler parses its input through a Zod schema before
touching the database.

**Auth is NextAuth v5** (`next-auth@5.0.0-beta.32`, exact-pinned — the API moves between
betas). `src/lib/auth/config.ts` is the whole configuration. Two things are worth knowing:

The rest of the app never touches it. `getSessionUserId()` and `getCurrentUser()` kept their
signatures and became wrappers over `auth()`, so the twenty call sites across cart, orders,
reviews, checkout and the account pages did not change — and the next swap need not touch
them either.

`Session` and `VerificationToken` exist in the schema and are **never written**. Sessions are
JWTs, which the Credentials provider forces; the models are there only because
`@auth/prisma-adapter` will not typecheck without them. Do not build on those tables.

**CSRF.** `SameSite=Lax` plus an origin check on every mutating route the app owns; NextAuth's
own endpoints add a double-submit token on top, which is what `tests/helpers/auth.ts` drives
rather than side-stepping. Note the origin check compares
`Origin` against the `Host` header, **not** `request.nextUrl.origin` — measured on Next 16.3.1,
that property is normalised to `http://localhost:<port>` regardless of the host the request
arrived on, so comparing against it rejects legitimate same-origin requests and breaks every
form behind a proxy or real hostname. See `src/lib/api/request.ts`.

**Login does not leak which accounts exist.** Unknown email and wrong password produce the
identical outcome, and the unknown-email path still spends a scrypt verification against a
throwaway hash — otherwise response time alone answers "is this address registered?", which is
how target lists get built before a credential-stuffing run. Sign-up hashes the password
*before* checking for a duplicate, for the same reason.

OAuth added a third case that needs the same treatment: a user who signed up with Google has
`passwordHash = null`, and returning early for them would be measurably faster than a real
check — the same oracle by another route. `authorize()` burns a dummy hash there too.

Nothing may widen that back out. NextAuth puts a thrown error's `code` in the redirect URL, so
distinct codes for "no such account" and "wrong password" would rebuild the oracle even with
one shared on-screen message. The only custom code is `rate_limited`, which says nothing about
whether an account exists.

**An OAuth email that already has a password account is rejected**, not linked
(`OAuthAccountNotLinked`). `allowDangerousEmailAccountLinking` is off, and its name is
accurate: turning it on means anyone who obtains an OAuth account at a victim's address
inherits that victim's order history. The sign-in page tells them to use their password.

**Route guards.** `src/proxy.ts` redirects unauthenticated requests to `/account`, `/checkout`
and `/orders` to sign-in, carrying the destination so signing in resumes the journey. The guard
verifies the JWT signature only — no database hit, so it stays Edge-safe — and the pages
re-check with `getCurrentUser()`, which is what catches a valid token for a since-deleted user.

**Open redirect.** The post-login `next` parameter is sanitised in
`src/lib/auth/redirect.ts`: root-relative paths only, with protocol-relative (`//evil.example`),
backslash (`/\evil.example`) and control-character forms all rejected. Without this, a link from
our own sign-in flow can deposit a user on a look-alike page an attacker controls.

**The client never sets a price.** A guest cart lives in IndexedDB, which the server cannot vouch
for, so only `{ productId, qty }` is ever stored there. Prices, titles and stock are resolved from
the database on every render via `/api/cart/resolve`, and `POST /api/orders` reads lines from the
server's own cart. A client can change *what* it is buying and *how many* — never at what price.
Asserted by sending a bogus `unitCents` and checking the real one comes back.

**Order placement is one transaction.** Re-read stock, verify it, decrement, create the order and
its snapshotted items, empty the cart — all together. As separate statements, a crash between them
leaves stock decremented with no order, or an order for goods never reserved. Stock is re-read
*inside* the transaction rather than trusted from the cart view the shopper was looking at, which
may be minutes old.

**Double-submit produces one order.** The idempotency key is generated once when the checkout flow
mounts, not per submit — a key per submit would defeat the point. A unique constraint on the column
is the actual guarantee; the disabled button is only the visible half. Two concurrent submissions
are tested, not assumed: one 201, one 200, one order, stock moved once.

**Cart merge sums, it does not replace.** A shopper who filled a basket as a guest then signs in
keeps both. Overwriting would silently discard whichever basket they did not touch most recently,
and they have no way to know which that was. Summing is then capped per line, so 8 + 8 becomes 10
rather than 16.

**No card data leaves the browser.** Luhn, expiry and CVC checks run entirely client-side in
`src/lib/checkout/card.ts`; the only value derived from the card that reaches the server is a label
like "Visa ending 4242". Luhn earns its place because length and prefix checks pass a transposed
pair of digits and a checksum does not.

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

## Search

Text search reuses `listProducts({ q })` and the same `ProductList` as the catalog, so results
paginate, filter and sort identically — a second search-results implementation would be a second
place for pagination to be subtly wrong. Typeahead suggestions come from
`/api/search/suggest` and use the *same* `searchText` predicate as the results page, so a
suggestion can never lead somewhere that returns nothing.

The search box is a real combobox — `role="combobox"` with `aria-expanded`, `aria-controls` and
`aria-activedescendant` over a `role="listbox"`. That is what makes arrow keys and screen-reader
announcement work; an input with a div of clickable results looks identical and is unusable without a
mouse. The form also has a real `action="/search"`, so search works before hydration and with
JavaScript off.

### Image search is a STUB

Worth being blunt, because the machinery around it is convincing. The upload works, camera capture
works on a phone, the file is genuinely validated, and the results render like any other product
grid. **No image analysis happens.**

`lib/search/imageStub.ts` derives a seed from the uploaded bytes and uses it to pick an arbitrary but
stable set of products — so the same photo always returns the same results, which makes the feature
demonstrable, while a different photo returns different ones. That is the whole trick. The UI labels
it as a stub in two places, and the API response carries `isStub: true` so the label cannot be
dropped downstream.

What *is* real is the validation, and it matters regardless: 4MB cap, MIME allow-list, and a
magic-byte check on the actual file signature — which is the only one of the three that cannot be
defeated by renaming a file or setting a header. A text file renamed `.png` with `Content-Type:
image/png` is rejected. The bytes are never written to disk.

Replacing the stub with real search means changing one function: produce an embedding for the
uploaded bytes, compare against embeddings stored per product, return the nearest. The route,
validation, UI and rendering all stay.

## Offline and the service worker

`public/sw.js` is **hand-written**. The plan was `@serwist/next`, which states outright that it does
not support Turbopack — and Next 16 builds with Turbopack. The alternatives were regressing to
webpack builds or adopting an experimental package. Hand-writing it costs ~230 lines, adds no
dependency, and buys the thing that matters most here: complete control over what is cached.

The rule that governs the whole file: **never cache anything user-specific.** A cached order page or
cart response on a shared device is a data leak, and a service-worker cache outlives a sign-out. The
deny-list is checked before any strategy runs, and covers `/account`, `/orders`, `/checkout`,
`/login`, `/signup`, `/api/auth/*`, `/api/cart*`, `/api/account/*`, `/api/orders` and
`/api/search/image`.

| What | Strategy |
|---|---|
| `/_next/static/*` | Cache-first — content-hashed, so a hit is always correct |
| `/img/*`, `/_next/image` | Cache-first, capped at 120 entries |
| `/api/products`, `/api/search/suggest` | Stale-while-revalidate, capped at 60 |
| Page navigations | Network-first → cached page → `/offline` |

Navigations are network-first, not cache-first: a storefront showing yesterday's prices is worse than
one that takes an extra moment. Cached HTML is stored with its own headers, including the per-request
CSP and nonce, so a replayed page stays internally consistent — serving cached HTML under a freshly
generated nonce would block every script on it.

Registered in production only. A service worker in development serves stale chunks after every edit,
which looks exactly like a broken hot reload.

`public/sw.js` sits outside both `tsc` and ESLint, so a syntax error there would ship silently.
`npm run typecheck` runs `node --check` on it for that reason.

### Orders placed offline

An order submitted with no network is queued in IndexedDB and replayed when the connection returns.
This is only safe because of the idempotency key: it is generated once when the checkout flow mounts,
so a replay that races a request which *did* get through produces one order, not two. Retrying
without one is a coin flip between "no order" and "two orders".

Replay is driven by the page's `online` event, not the Background Sync API. Background Sync would
survive the tab closing, which is genuinely better, but it is Chromium-only and needs the service
worker to hold credentials and interpret failures. The page-driven version works everywhere and fails
visibly; the trade is that the tab has to stay open, and the UI says so.

A 4xx other than 429 drops the queued order rather than retrying a rejection forever. A 5xx or
network failure keeps its place, up to five attempts.

**One IndexedDB opener.** `lib/idb.ts` owns the database version and store list. This exists because
of a bug: the cart opened `prefrmart` at v1 while the order queue opened it at v2, and IndexedDB refuses
to open at a lower version than it currently has — so whichever ran second failed, and which one that
was depended on whether the shopper visited the cart or checked out first.

## Accessibility

`npm run check:a11y` audits two things a machine can check reliably, reading colour values straight
out of `globals.css` so it cannot drift from the design:

- **Contrast** for every foreground/background pair the UI actually renders, against WCAG AA (4.5:1
  text, 3:1 large text and UI boundaries). It found four real failures, all now fixed:
  `fg-subtle` at 3.87:1, `border-strong` at 1.86:1, and the filled star at 2.15:1. Each replacement
  was solved against *both* `surface` and `surface-sunken`, since most appear on either.
- **Structure** on eight routes: one `h1`, a `main` landmark and skip-link target, `lang`, named
  `nav` regions, `alt` on every image, an accessible name on every input, no positive `tabindex`, no
  restricted zoom.

`--color-star-empty` is the one deliberate exception at 1.44:1. It is the *unfilled* part of a rating
track and is meant to recede; at 3:1 an empty star reads as filled. Exempt under WCAG 1.4.11 because
the stars are `aria-hidden` and the rating is also given as text — the graphic is decorative, not the
only route to the information.

Beyond the audit: 44px minimum touch targets throughout, `prefers-reduced-motion` respected, visible
focus rings never removed, `aria-live` on cart totals and search results, and infinite scroll always
backed by a real "Load more" button because an IntersectionObserver is unreachable by keyboard.

What the audit cannot check: focus order, whether an `aria-label` reads sensibly, or anything needing
a real accessibility tree. Those need a browser and a person.

**Voice commands remain out of scope** — see the top of this file.

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

The checkout suite writes real orders and moves real stock, so it restores both in `afterAll`.
Verified by snapshotting total stock, order count and address count before and after three
consecutive runs: identical each time.

### What the tests do not cover

There is **no browser in the loop**. Playwright was considered and deliberately dropped, so the
following are reasoned, hand-verified against a real server where possible, and unit-tested where the
logic is pure — but never *observed* running in a browser:

- IntersectionObserver firing for infinite scroll, and sessionStorage scroll restore
- IndexedDB persistence, and the guest→signed-in cart merge as triggered by the provider
- The cart and checkout UI after hydration — `curl` sees only the pre-hydration skeleton
- Service worker installation, caching behaviour and offline replay
- Whether the combobox actually announces correctly in a screen reader

The pure logic behind most of that *is* covered — cart merge and clamping, card validation,
cursor pagination, the CSRF origin check, session token verification, open-redirect sanitising. The
wiring between them is not.

## Status

**All six phases complete.** 258 tests.

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
- **P5** — IndexedDB guest cart, server cart for signed-in users, merge on sign-in, cart page with
  quantity steppers and stock clamping, header badge, and a four-step checkout (address →
  delivery → mock payment → review) placing orders transactionally with idempotency.
- **P6** — text search with a real combobox and typeahead, the labelled image-search stub, a
  hand-written service worker with offline caching and an offline page, an offline order queue with
  idempotent replay, and a contrast/structure accessibility audit that found and fixed four real
  failures.

Deliberately not built: **Playwright and any further tests** (dropped on request), **voice commands**,
and **real image similarity**.

**Deliberately out of scope:** voice commands, and real image-similarity search — the
image search shipping in Phase 6 is a labelled stub behind `lib/search/imageStub.ts`.
