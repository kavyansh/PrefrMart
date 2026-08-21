import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogToolbar } from '@/components/catalog/CatalogToolbar';
import type { CatalogFilters } from '@/lib/catalog/query';

/**
 * The toolbar is where filter state becomes navigation, so these tests are mostly about the URLs
 * that come out of it. `useCatalogFilters` is deliberately left real — it is the thing being
 * exercised — and only the router underneath it is replaced.
 *
 * Three properties are worth guarding:
 *
 *  1. `scroll: false` on every push. Without it, changing a sort throws the shopper back to the top
 *     of the listing, which reads as the page having reloaded.
 *  2. On `/c/<slug>` the category is carried by the route and must not also become a query param,
 *     or the URL becomes `/c/books?category=books`.
 *  3. The chips name the filter they remove. Three chips whose buttons are all called "Remove" are
 *     unusable by voice or screen reader.
 */

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

function setup(filters: CatalogFilters = {}, basePath = '/') {
  render(<CatalogToolbar filters={filters} basePath={basePath} totalCount={1_234} />);
  return { user: userEvent.setup() };
}

/** The URL a push was called with, ignoring the options argument. */
const pushedUrl = () => push.mock.calls.at(-1)?.[0];

describe('CatalogToolbar', () => {
  beforeEach(() => {
    push.mockClear();
  });

  describe('sort', () => {
    it('shows the current sort, defaulting to newest', () => {
      setup({});

      // `sort` is absent from the URL for the default, so the control has to fall back rather than
      // render blank.
      expect(screen.getByRole('combobox', { name: /Sort/ })).toHaveValue('newest');
    });

    it('navigates on change, without scrolling to the top', async () => {
      const { user } = setup({});

      await user.selectOptions(screen.getByRole('combobox', { name: /Sort/ }), 'price-asc');

      expect(pushedUrl()).toBe('/?sort=price-asc');
      expect(push).toHaveBeenLastCalledWith(expect.any(String), { scroll: false });
    });

    it('drops the parameter entirely when returning to the default sort', async () => {
      const { user } = setup({ sort: 'rating' });

      await user.selectOptions(screen.getByRole('combobox', { name: /Sort/ }), 'newest');

      // Not `/?sort=newest`: the canonical URL for an unfiltered listing is clean.
      expect(pushedUrl()).toBe('/');
    });

    it('does not offer relevance, which only means something with a search term', () => {
      setup({});

      expect(screen.queryByRole('option', { name: 'Most relevant' })).not.toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Customer rating' })).toBeInTheDocument();
    });
  });

  describe('active filter chips', () => {
    it('shows nothing when no filter is applied', () => {
      setup({ sort: 'rating' });

      // A sort is not a filter — it narrows nothing — so it gets no chip and no count.
      expect(screen.queryByRole('button', { name: /^Remove filter/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
    });

    it('names each applied filter in its own remove button', () => {
      setup({ minPrice: 50_000, maxPrice: 200_000, minRating: 4, inStock: true });

      expect(
        screen.getByRole('button', { name: 'Remove filter ₹500 – ₹2,000' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove filter 4 stars & up' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove filter In stock' })).toBeInTheDocument();
    });

    it('describes an open-ended band by its one bound', () => {
      setup({ maxPrice: 50_000 });
      expect(screen.getByRole('button', { name: 'Remove filter Under ₹500' })).toBeInTheDocument();

      push.mockClear();
      setup({ minPrice: 5_000_000 });
      expect(screen.getByRole('button', { name: 'Remove filter Over ₹50,000' })).toBeInTheDocument();
    });

    it('removes one filter and leaves the rest in the URL', async () => {
      const { user } = setup({ minRating: 4, inStock: true });

      await user.click(screen.getByRole('button', { name: 'Remove filter 4 stars & up' }));

      expect(pushedUrl()).toBe('/?inStock=true');
    });

    it('counts a two-bound price band as one filter', () => {
      setup({ minPrice: 50_000, maxPrice: 200_000, inStock: true });

      // The badge on the mobile Filters button. A band that counted as two would tell the shopper
      // they have three filters applied when they have two.
      expect(screen.getByRole('button', { name: /Filters/ })).toHaveAccessibleName(
        expect.stringContaining('2'),
      );
    });
  });

  describe('clear all', () => {
    it('returns to the bare listing', async () => {
      const { user } = setup({ minPrice: 50_000, minRating: 4, inStock: true });

      await user.click(screen.getByRole('button', { name: 'Clear all' }));

      expect(pushedUrl()).toBe('/');
    });

    it('keeps the sort, which is not a filter', async () => {
      const { user } = setup({ minRating: 4, sort: 'price-desc' });

      await user.click(screen.getByRole('button', { name: 'Clear all' }));

      // Clearing filters should not also reset how the results are ordered.
      expect(pushedUrl()).toBe('/?sort=price-desc');
    });

    it('stays within a category without duplicating it as a query param', async () => {
      const { user } = setup({ category: 'books', minRating: 4 }, '/c/books');

      await user.click(screen.getByRole('button', { name: 'Clear all' }));

      // Not `/c/books?category=books`.
      expect(pushedUrl()).toBe('/c/books');
    });

    it('keeps a search term, which is what the shopper is browsing within', async () => {
      const { user } = setup({ q: 'headphones', inStock: true }, '/search');

      await user.click(screen.getByRole('button', { name: 'Clear all' }));

      expect(pushedUrl()).toBe('/search?q=headphones');
    });
  });

  describe('mobile filter sheet', () => {
    it('opens on request and offers the same controls as the sidebar', async () => {
      const { user } = setup({ minRating: 4 });

      await user.click(screen.getByRole('button', { name: /Filters/ }));

      // The same FilterControls the desktop sidebar renders — one component, so the two can never
      // drift apart. jsdom does not implement <dialog>'s focus trap (see tests/setup/components.ts),
      // so this asserts the contents are reachable, not the modal behaviour around them.
      const sheet = await screen.findByRole('dialog');
      expect(sheet).toHaveAttribute('open');
      expect(screen.getByRole('group', { name: 'Price' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'In stock only' })).toBeInTheDocument();
    });

    it('reports how many products the current filters match', async () => {
      const { user } = setup({});

      await user.click(screen.getByRole('button', { name: /Filters/ }));

      expect(await screen.findByText('1,234 products match')).toBeInTheDocument();
    });
  });
});
