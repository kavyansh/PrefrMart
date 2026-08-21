import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterControls } from '@/components/catalog/FilterControls';
import { PRICE_BANDS, type CatalogFilters } from '@/lib/catalog/query';
import type { CatalogFilterActions } from '@/hooks/useCatalogFilters';

/**
 * These controls are stateless — they render `filters` and call `actions`. So the behaviour worth
 * pinning down is the part that is not obvious from reading either: the *toggle-off* arguments.
 *
 * Pressing an already-active price band must pass `null`, and an already-active rating must pass
 * `undefined`. Both mean "remove this filter", and both are easy to get wrong in a way that looks
 * fine on screen — the button un-highlights either way — while the URL keeps the filter and the
 * results never change. That is the bug these tests exist for.
 *
 * The other reason this component exists is that it renders in two places (the mobile sheet and the
 * desktop sidebar) so the two can never offer different filters. That property is structural and is
 * covered by CatalogToolbar's test, which finds these same controls inside the sheet.
 */

/**
 * Looks a band up in the catalog's own list rather than restating its bounds here, so these tests
 * cannot quietly describe a band the UI no longer offers.
 */
function band(label: string) {
  const found = PRICE_BANDS.find((candidate) => candidate.label === label);
  if (found === undefined) throw new Error(`No price band labelled "${label}"`);
  return found;
}

const UNDER_500 = band('Under ₹500');
const MID_BAND = band('₹2,000 – ₹10,000');

/** Actions with every callback spied. `activeBand` is passed in, as the hook derives it. */
function stubActions(overrides: Partial<CatalogFilterActions> = {}): CatalogFilterActions {
  return {
    isPending: false,
    activeCount: 0,
    activeBand: null,
    setSort: vi.fn(),
    setPriceBand: vi.fn(),
    setMinRating: vi.fn(),
    toggleInStock: vi.fn(),
    clearAll: vi.fn(),
    ...overrides,
  };
}

function setup(filters: CatalogFilters = {}, overrides: Partial<CatalogFilterActions> = {}) {
  const actions = stubActions(overrides);
  render(<FilterControls filters={filters} actions={actions} />);
  return { actions, user: userEvent.setup() };
}

describe('FilterControls', () => {
  describe('price bands', () => {
    it('reports which band is applied through aria-pressed', () => {
      setup({ minPrice: MID_BAND.min, maxPrice: MID_BAND.max }, { activeBand: MID_BAND });

      // aria-pressed rather than a checkbox: each band *replaces* a URL parameter rather than
      // contributing to a form submission.
      expect(screen.getByRole('button', { name: MID_BAND.label, pressed: true })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: UNDER_500.label })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('applies a band by passing its bounds', async () => {
      const { user, actions } = setup();

      await user.click(screen.getByRole('button', { name: UNDER_500.label }));

      expect(actions.setPriceBand).toHaveBeenCalledWith(UNDER_500);
    });

    it('clears the band by passing null when the active one is pressed again', async () => {
      const { user, actions } = setup(
        { minPrice: MID_BAND.min, maxPrice: MID_BAND.max },
        { activeBand: MID_BAND },
      );

      await user.click(screen.getByRole('button', { name: MID_BAND.label }));

      // null, not the band again. Passing the band would re-apply the filter it just un-highlighted.
      expect(actions.setPriceBand).toHaveBeenCalledWith(null);
    });
  });

  describe('rating', () => {
    it('offers 4, 3 and 2 stars and up, and marks the active one', () => {
      setup({ minRating: 3 });

      expect(screen.getByRole('button', { name: /3 & up/, pressed: true })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /4 & up/ })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      // 1 & up would match everything, so it is not offered.
      expect(screen.queryByRole('button', { name: /1 & up/ })).not.toBeInTheDocument();
    });

    it('applies a minimum rating', async () => {
      const { user, actions } = setup();

      await user.click(screen.getByRole('button', { name: /4 & up/ }));

      expect(actions.setMinRating).toHaveBeenCalledWith(4);
    });

    it('clears the rating by passing undefined when the active one is pressed again', async () => {
      const { user, actions } = setup({ minRating: 4 });

      await user.click(screen.getByRole('button', { name: /4 & up/ }));

      // undefined is what `buildQueryString` omits. A 0 here would serialise as minRating=0.
      expect(actions.setMinRating).toHaveBeenCalledWith(undefined);
    });
  });

  describe('availability', () => {
    it('reflects the filter and toggles it', async () => {
      const { user, actions } = setup({ inStock: true });

      const checkbox = screen.getByRole('checkbox', { name: 'In stock only' });
      expect(checkbox).toBeChecked();

      await user.click(checkbox);
      expect(actions.toggleInStock).toHaveBeenCalled();
    });

    it('is unchecked when the filter is absent rather than false', () => {
      setup({});

      // `inStock` is `true | undefined` — never `false` — so the checkbox has to read an absent
      // value as off.
      expect(screen.getByRole('checkbox', { name: 'In stock only' })).not.toBeChecked();
    });
  });

  it('groups each filter under a named fieldset', () => {
    setup();

    // Three legends, so a screen reader announces which group a control belongs to rather than
    // reading eight unrelated buttons.
    expect(screen.getByRole('group', { name: 'Price' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Customer rating' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Availability' })).toBeInTheDocument();
  });
});
