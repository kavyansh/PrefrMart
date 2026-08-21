# Component tests

**Date:** 2026-08-21
**Status:** accepted

## The gap

Every test in this repo today is either a pure-logic unit test (`src/lib/**/*.test.ts`) or an
integration test that boots a real server and talks to the database (`tests/*.integration.test.ts`).
Nothing renders a component.

That leaves a specific class of bug uncovered: behaviour that lives in a client component's state
machine and its ARIA output. `vitest.config.ts` says as much in a comment — component tests need
jsdom, "which is added when there is a component whose behaviour is worth testing in isolation".
There are now several. `AddToCartButton` has a three-state machine with a timer. `AuthForm` does two
sequential requests and maps server field errors back onto inputs. `CheckoutFlow` generates one
idempotency key per mount and distinguishes a thrown fetch from a 4xx. None of that is reachable
from a pure unit test, and driving it through the integration suite would mean asserting on a real
browser's worth of setup to check a state transition.

## Approach

Add a second Vitest project rather than changing the environment of the existing one.

`vitest.config.ts` grows a `test.projects` array with two entries:

- **`unit`** — node environment, `src/**/*.test.ts` and `tests/**/*.test.ts`. Keeps the 30s
  `testTimeout`, the 120s `hookTimeout` and `fileParallelism: false` that the Neon-backed
  integration suites need.
- **`components`** — jsdom environment, `src/**/*.test.tsx`, the `@vitejs/plugin-react` transform,
  and a setup file. Default timeouts, parallel files: nothing here touches a network or a database.

The alternative — flipping the whole config to jsdom — would put the suites that spawn `next start`
inside a fake DOM for no benefit, and would make fast component tests queue behind 30-second server
boots under `fileParallelism: false`. A separate config file with its own npm script was the other
option, and was rejected because it drops component tests out of `npm run verify`, which is the gate
that actually runs.

`npm test`, `npm run test:watch` and `npm run verify` pick the new project up with no script changes.
`npx vitest run --project components` runs it alone.

### Dependencies

Per `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`: `@vitejs/plugin-react`,
`@testing-library/react`, `@testing-library/dom`. Plus `@testing-library/user-event`, because these
components care about real event sequences (typing into a controlled number input, clicking a label
that wraps a visually hidden radio), and `@testing-library/jest-dom`, because so much of what is
worth asserting here is ARIA state — `toBeDisabled`, `toHaveAccessibleName`, `toHaveAttribute`.
`jsdom` is already a devDependency. `vite-tsconfig-paths` is not needed: the config already aliases
`@` explicitly.

### Setup file

`tests/setup/components.ts` handles what every component test needs:

- registers the `jest-dom` matchers
- `cleanup()` after each test
- resets `useCartStore` to its initial state after each test. The store is a module-level singleton
  by deliberate design — its own comment notes `mergedFor` was moved into state precisely so a test
  could reset it — and without this, one test's cart lines leak into the next.
- shims `<dialog>`'s `showModal()` and `close()`, which jsdom 29 does not implement at all. Without
  them `Sheet`'s effect throws on first open and takes the render with it. The shim moves the `open`
  attribute (which jsdom does reflect onto `dialog.open`) and fires `close`. It supplies none of the
  behaviour `Sheet` was built on native `<dialog>` *for* — focus trap, focus restore, Escape, inert
  background — so tests may assert the sheet's contents are reachable and must not claim anything
  about focus.

`crypto.randomUUID`, which `CheckoutFlow` calls on mount, needs no shim: jsdom 29 provides it.

### Lint

`eslint.config.mjs` turns `@next/next/no-img-element` off for `**/*.test.tsx`. Two tests stand in
for `next/image` with a plain `<img>`; the rule is about LCP and bandwidth on shipped pages, neither
of which exists in jsdom. Scoped to test files so the rule keeps working everywhere it means
something.

## Test files

Colocated as `*.test.tsx` beside the component, matching the existing `src/lib/**/*.test.ts`
convention.

| File | Behaviour pinned down |
| --- | --- |
| `src/components/cart/QuantityStepper.test.tsx` | Ceiling is `min(stock, MAX_QTY_PER_LINE)`; `+` disables at the ceiling and `−` at 1; a non-numeric edit is ignored rather than snapping to 1; controls name their product |
| `src/components/cart/AddToCartButton.test.tsx` | Out-of-stock renders a disabled button and no live region; idle → adding → added → idle on fake timers; the announcement names the product; a rejected `addItem` returns to idle |
| `src/components/cart/CartContents.test.tsx` | Loading skeleton, empty state; `qty === 0` lines render as out-of-stock with no stepper and are excluded from the total; the `clampedFrom` explanation; free-delivery shortfall; stepper and remove wired to the store |
| `src/components/catalog/FilterControls.test.tsx` | `aria-pressed` reflects active state; pressing the active price band passes `null` and the active rating passes `undefined` — the toggle-off paths |
| `src/components/catalog/CatalogToolbar.test.tsx` | Chips mirror active filters and each names its own filter; sort and clear-all push the expected URL with `scroll: false`; on `/c/<slug>` the category never becomes a query param |
| `src/components/auth/AuthForm.test.tsx` | Client validation blocks submission; signup POSTs `/api/auth/signup` before `signIn`; server field errors land on the right inputs; `router.refresh()` precedes `router.replace()`; the minimum length is enforced on signup only |
| `src/components/review/ReviewForm.test.tsx` | A rating is required; success swaps to the `role="status"` panel and calls `router.refresh()`; server field errors are mapped back; the character counter tracks the textarea |
| `src/components/checkout/CheckoutFlow.test.tsx` | Step progression and which steps stay reachable; one idempotency key across a double-submit; a thrown fetch queues the order while a 4xx surfaces the message instead |

Each file mocks only its own boundaries — `next/navigation`, `next-auth/react`, `next/image`,
`@/lib/orders/queue`, and `fetch`. The cart store module is never mocked: tests seed it with
`useCartStore.setState`, so components still subscribe through the real selector hooks and the
selectors stay on the path under test. Where a test needs to observe a cart mutation it replaces
that one action on the store, which also keeps IndexedDB out of the picture without mocking
`@/lib/cart/idb`.

## Out of scope

- `src/components/ui/*` primitives. Their behaviour is a class string; a test would restate the JSX.
- `ProductList` — virtualized via `@tanstack/react-virtual`, which needs element measurements jsdom
  does not compute. Covered by `tests/pagination.integration.test.ts` at the API level.
- Async server components. The Next guide is explicit that Vitest does not support them and that
  they belong in E2E.

## Tooling constraints found while implementing

Three things behave differently here than the usual Testing Library advice assumes. Each is
commented at the point it bites, and recorded here so the next person does not rediscover them.

**Fake timers break `findBy*`.** Testing Library's `waitFor` polls on a `setInterval` and detects
Jest's fake clock, not Vitest's — so with timers faked, every `findBy*` waits on an interval that
will never fire. `user-event` is affected too: it awaits internal `setTimeout` delays of its own, so
`user.click` never returns. Only `AddToCartButton`'s return-to-idle test needs a clock; it fakes
`setTimeout`/`clearTimeout` only (Vitest's default also fakes `queueMicrotask`, which React
schedules through), clicks with `fireEvent`, and advances the clock by hand instead of polling.

**A controlled input cannot be driven by `clear()` then `type()`.** React restores a controlled
input's DOM value after any event that does not change state, so on `QuantityStepper` — whose parent
in the test is a spy — clearing and typing `9` puts `19` in the box, not `9`. Those cases use
`fireEvent.change` to state the field's contents directly, which is the input the parsing branch
actually receives.

**Accessible names lose the space between a label and an adjacent `sr-only` span.**
`dom-accessibility-api` trims each text node before joining, so the cart's remove button computes as
`RemoveKestrel Ultra Webcam from your cart`; browsers use rendered text and keep the space. The test
matches either form rather than pinning one implementation's behaviour. Worth knowing before reading
that as a product bug.
