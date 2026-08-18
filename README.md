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

**Security.** A per-request nonce CSP is set in `src/proxy.ts` (Next 16's rename of
`middleware.ts`); static headers are in `next.config.ts`. Passwords use `node:crypto`
scrypt with per-user salts and constant-time comparison. `react/no-danger` is an ESLint
error, so nothing in the tree can inject raw HTML. Every route handler parses its input
through a Zod schema before touching the database.

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

## Status

**Phases 1-2 of 6 complete.**

- **P1** — foundation, Prisma schema, deterministic seed, design tokens, cursor pagination,
  nonce CSP, product listing API, verification harness.
- **P2** — product listing pages (home and category) with cursor-driven infinite scroll,
  URL-based filters and sort, mobile filter sheet and desktop rail, skeleton/empty/error
  states, back-navigation restore, real 404s.

Not yet built: product page and review submission (P3), auth and settings (P4), cart and
checkout (P5), search, offline/PWA and the a11y pass (P6).

**Deliberately out of scope:** voice commands, and real image-similarity search — the
image search shipping in Phase 6 is a labelled stub behind `lib/search/imageStub.ts`.
