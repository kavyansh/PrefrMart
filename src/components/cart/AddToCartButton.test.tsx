import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddToCartButton } from '@/components/cart/AddToCartButton';
import { useCartStore } from '@/lib/cart/store';

/**
 * A three-state machine (idle → adding → added → idle) with a timer in it, which is exactly the
 * shape of thing that looks right in a browser and is wrong in a way nobody notices: the button
 * stays stuck on "Added to cart" and the shopper cannot add a second one.
 *
 * The store's `addItem` is replaced rather than the whole store mocked, so the component still
 * subscribes through the real `useAddItem` selector. That selector's contract — a function whose
 * identity never changes, so this button never re-renders on cart traffic — stays part of the path
 * under test.
 *
 * Note that only the return-to-idle test uses fake timers, and it does its own advancing rather
 * than using `findBy*`. Testing Library's `waitFor` polls on a `setInterval`, and it cannot detect
 * Vitest's fake clock the way it detects Jest's — so with timers faked globally, every `findBy*`
 * waits on an interval that will never fire. Where the clock is ours to control there is nothing to
 * poll for anyway: advance it, then assert synchronously.
 */

/** Replaces `addItem` on the real store and hands back the spy. */
function stubAddItem(implementation: () => Promise<void> = async () => {}) {
  const addItem = vi.fn(implementation);
  useCartStore.setState({ addItem });
  return addItem;
}

const PRODUCT = { productId: 'p1', productTitle: 'Kestrel Ultra Webcam' };

describe('AddToCartButton', () => {
  it('refuses to add anything when stock is zero', () => {
    const addItem = stubAddItem();
    render(<AddToCartButton {...PRODUCT} stock={0} />);

    expect(screen.getByRole('button', { name: 'Out of stock' })).toBeDisabled();
    expect(addItem).not.toHaveBeenCalled();
  });

  it('adds one unit and confirms in place', async () => {
    const user = userEvent.setup();
    const addItem = stubAddItem();
    render(<AddToCartButton {...PRODUCT} stock={5} />);

    await user.click(screen.getByRole('button', { name: 'Add to cart' }));

    // One unit per press. The stepper on the cart page is where a shopper picks a quantity; this
    // button adding two would be a surprise.
    expect(addItem).toHaveBeenCalledWith('p1', 1);
    expect(await screen.findByRole('button', { name: 'Added to cart' })).toBeEnabled();
  });

  it('announces what was added, naming the product', async () => {
    const user = userEvent.setup();
    stubAddItem();
    render(<AddToCartButton {...PRODUCT} stock={5} />);

    await user.click(screen.getByRole('button', { name: 'Add to cart' }));

    // The live region is the entire confirmation for a screen reader user — the design this
    // replaced navigated to the cart, which throws a browsing shopper out of the page.
    expect(await screen.findByText('Kestrel Ultra Webcam added to your cart')).toBeInTheDocument();
  });

  it('disables itself only while the request is in flight', async () => {
    const user = userEvent.setup();

    // A promise held open, so the "adding" state can be observed rather than raced past.
    let release: () => void = () => {};
    stubAddItem(() => new Promise<void>((resolve) => { release = resolve; }));

    render(<AddToCartButton {...PRODUCT} stock={5} />);
    await user.click(screen.getByRole('button', { name: 'Add to cart' }));

    expect(await screen.findByRole('button', { name: 'Adding…' })).toBeDisabled();

    await act(async () => { release(); });

    expect(screen.getByRole('button', { name: 'Added to cart' })).toBeEnabled();
  });

  it('returns to idle on failure rather than claiming the item was added', async () => {
    const user = userEvent.setup();
    stubAddItem(() => Promise.reject(new Error('offline')));

    render(<AddToCartButton {...PRODUCT} stock={5} />);
    await user.click(screen.getByRole('button', { name: 'Add to cart' }));

    // Pressable again and, critically, the live region stays empty: announcing a success that did
    // not happen is worse than saying nothing.
    expect(await screen.findByRole('button', { name: 'Add to cart' })).toBeEnabled();
    expect(screen.queryByText(/added to your cart/)).not.toBeInTheDocument();
  });

  it('returns to idle after a moment, so a second unit can be added', async () => {
    /*
     * Fake only the two functions the component uses, and click with fireEvent rather than
     * user-event.
     *
     * Two separate reasons, both about the fake clock. Vitest's default fakes everything it can,
     * including `queueMicrotask`, which React schedules its own work through — faking it stalls the
     * renderer. And user-event awaits internal `setTimeout` delays of its own, which do not resolve
     * against a clock this test is driving by hand, so `user.click` never returns. `fireEvent`
     * dispatches the event and nothing else, which is all a plain button press needs.
     */
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    stubAddItem();

    try {
      render(<AddToCartButton {...PRODUCT} stock={5} />);
      fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

      // Flushes the awaited `addItem`, which is a microtask rather than a timer.
      await act(async () => {});
      expect(screen.getByRole('button', { name: 'Added to cart' })).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_500);
      });

      // This is the regression that matters: without the timer the button reads "Added to cart"
      // forever and the shopper has no way to add a second one.
      expect(screen.getByRole('button', { name: 'Add to cart' })).toBeInTheDocument();
      // And the announcement is cleared, so it is not re-read on some later update.
      expect(screen.queryByText(/added to your cart/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
