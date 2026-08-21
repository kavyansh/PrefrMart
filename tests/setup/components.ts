/**
 * Setup for the `components` Vitest project. See vitest.config.ts for why it is its own project.
 *
 * Everything here is something *every* component test needs. Per-component boundaries — the
 * router, next-auth, next/image, IndexedDB — are mocked in the test files that care about them, so
 * that reading one test tells you what it depends on.
 */

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';
import { useCartStore } from '@/lib/cart/store';

/**
 * The cart store's initial state, captured before any test has touched it.
 *
 * `useCartStore` is a module-level singleton, deliberately: its own comments explain that every
 * consumer wants a different slice, and that `mergedFor` was moved out of a ref and into the store
 * specifically so a test could reset it. This is that reset. Without it, lines added by one test
 * are still in the cart for the next one.
 */
let initialCartState: ReturnType<typeof useCartStore.getState>;

beforeAll(() => {
  initialCartState = useCartStore.getState();
});

/**
 * jsdom 29 does not implement the `<dialog>` element's imperative API — `showModal` and `close` are
 * simply absent, so `Sheet`'s effect throws on the first open and takes the whole render with it.
 *
 * This shim is the minimum that makes `Sheet` drivable: it moves the `open` attribute, which jsdom
 * does reflect onto `dialog.open`, and fires the `close` event that `Sheet` syncs state back from.
 *
 * Be clear about what it does *not* give you. `Sheet` was built on native `<dialog>` precisely
 * because the browser supplies the focus trap, focus restore, Escape handling and inert background
 * — the reason Radix could be dropped for it. None of that exists here. So a test may assert that
 * opening the sheet reveals its contents and that closing it syncs back, and must not claim
 * anything about focus behaviour; that needs a real browser.
 */
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };

  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

afterEach(() => {
  // Unmount everything and empty the document, so a query in the next test cannot match a node
  // left behind by this one.
  cleanup();
  useCartStore.setState(initialCartState, true);
});
