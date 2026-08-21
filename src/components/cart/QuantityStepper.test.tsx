import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuantityStepper } from '@/components/cart/QuantityStepper';
import { MAX_QTY_PER_LINE } from '@/lib/cart/types';

/**
 * The stepper is a controlled component with no state of its own, so what is worth testing is the
 * ceiling arithmetic and the guards — two things that are easy to get subtly wrong and invisible
 * until a shopper hits them.
 *
 * The ceiling is `min(stock, MAX_QTY_PER_LINE)`. Both halves matter: a per-line cap that ignored
 * stock would let someone order ten of a product with two left, and a stock ceiling that ignored
 * the cap would let them order five hundred.
 */

/** Renders with a spy on `onChange`, which is the only output this component has. */
function setup(props: Partial<Parameters<typeof QuantityStepper>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <QuantityStepper
      qty={2}
      max={5}
      productTitle="Kestrel Ultra Webcam"
      onChange={onChange}
      {...props}
    />,
  );

  return {
    onChange,
    user: userEvent.setup(),
    decrease: screen.getByRole('button', { name: 'Decrease quantity of Kestrel Ultra Webcam' }),
    increase: screen.getByRole('button', { name: 'Increase quantity of Kestrel Ultra Webcam' }),
    input: screen.getByRole('spinbutton', { name: 'Quantity of Kestrel Ultra Webcam' }),
  };
}

describe('QuantityStepper', () => {
  it('names the product it affects, so a multi-line cart has no duplicate controls', () => {
    const { decrease, increase, input } = setup();

    // The accessible names are the reason a five-row cart does not present ten identical
    // "Increase" buttons to a screen reader.
    expect(decrease).toHaveAccessibleName('Decrease quantity of Kestrel Ultra Webcam');
    expect(increase).toHaveAccessibleName('Increase quantity of Kestrel Ultra Webcam');
    expect(input).toHaveAccessibleName('Quantity of Kestrel Ultra Webcam');
  });

  it('steps by one in each direction', async () => {
    const { user, onChange, decrease, increase } = setup({ qty: 3 });

    await user.click(increase);
    expect(onChange).toHaveBeenLastCalledWith(4);

    await user.click(decrease);
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it('stops decreasing at 1 — removing a line is the Remove button, not a zero here', () => {
    const { decrease } = setup({ qty: 1 });
    expect(decrease).toBeDisabled();
  });

  it('takes stock as the ceiling when stock is the tighter limit', () => {
    const { increase, input } = setup({ qty: 3, max: 3 });

    expect(increase).toBeDisabled();
    expect(input).toHaveAttribute('max', '3');
  });

  it('takes the per-line cap as the ceiling when stock is plentiful', () => {
    const { increase, input } = setup({ qty: MAX_QTY_PER_LINE, max: 900 });

    // Not 900: nobody buys 900 webcams, and letting them try is how one order drains a
    // warehouse.
    expect(increase).toBeDisabled();
    expect(input).toHaveAttribute('max', String(MAX_QTY_PER_LINE));
  });

  /*
   * The three typed-value cases below use fireEvent rather than user-event, which is the opposite
   * of the usual advice and worth explaining.
   *
   * This input is controlled and the parent here is a spy, so `qty` never advances. React restores
   * a controlled input's DOM value after any event that does not change state — so `clear()`
   * followed by typing "9" does not put "9" in the box, it puts "19" there, and the assertion ends
   * up describing a keystroke sequence the component can never actually see. fireEvent states the
   * field's contents directly, which is exactly the input this parsing branch takes.
   */

  it('clamps a typed quantity down to the ceiling rather than passing it through', () => {
    const { onChange, input } = setup({ qty: 1, max: 4 });

    fireEvent.change(input, { target: { value: '9' } });

    expect(onChange).toHaveBeenLastCalledWith(4);
  });

  it('clamps a typed zero up to 1', () => {
    const { onChange, input } = setup({ qty: 1, max: 4 });

    fireEvent.change(input, { target: { value: '0' } });

    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('ignores an emptied field instead of snapping to 1 mid-edit', () => {
    const { onChange, input } = setup({ qty: 5, max: 9 });

    // An empty box is what replacing "5" with "12" looks like on the way through. Reporting 1 here
    // would fight the user: the field would jump to 1 before they typed the second digit.
    fireEvent.change(input, { target: { value: '' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables everything while a change is in flight', () => {
    const { decrease, increase, input } = setup({ qty: 3, disabled: true });

    expect(decrease).toBeDisabled();
    expect(increase).toBeDisabled();
    expect(input).toBeDisabled();
  });
});
