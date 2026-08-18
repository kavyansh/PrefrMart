import { describe, expect, it } from 'vitest';
import {
  buildQueryString,
  clearedFilters,
  countActiveFilters,
  DEFAULT_SORT,
  filtersKey,
  hasActiveFilters,
  parseFilters,
  productsApiUrl,
  type CatalogFilters,
} from './query';

const params = (init: string) => new URLSearchParams(init);

describe('parseFilters', () => {
  it('returns an empty filter set for no params', () => {
    expect(parseFilters(params(''))).toEqual({
      sort: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      minRating: undefined,
      inStock: undefined,
      q: undefined,
    });
  });

  it('reads a full filter set', () => {
    const filters = parseFilters(
      params('sort=price-asc&minPrice=1000&maxPrice=5000&minRating=4&inStock=true&q=shoes'),
    );
    expect(filters).toMatchObject({
      sort: 'price-asc',
      minPrice: 1000,
      maxPrice: 5000,
      minRating: 4,
      inStock: true,
      q: 'shoes',
    });
  });

  it('drops an unknown sort rather than passing it through', () => {
    // A bad sort must not reach the query layer, where it would index into ORDER_BY
    // and yield undefined.
    expect(parseFilters(params('sort=cheapest')).sort).toBeUndefined();
  });

  it('drops non-numeric prices', () => {
    const filters = parseFilters(params('minPrice=abc&maxPrice='));
    expect(filters.minPrice).toBeUndefined();
    expect(filters.maxPrice).toBeUndefined();
  });

  it('rejects negative prices', () => {
    expect(parseFilters(params('minPrice=-500')).minPrice).toBeUndefined();
  });

  it('accepts a zero minimum price', () => {
    // 0 is a legitimate lower bound and must survive the falsy check.
    expect(parseFilters(params('minPrice=0')).minPrice).toBe(0);
  });

  it('only accepts ratings in 1-5', () => {
    expect(parseFilters(params('minRating=4')).minRating).toBe(4);
    expect(parseFilters(params('minRating=0')).minRating).toBeUndefined();
    expect(parseFilters(params('minRating=6')).minRating).toBeUndefined();
  });

  it('treats inStock=false as no filter, not as false', () => {
    // Only `true` narrows the results; anything else means "do not filter".
    expect(parseFilters(params('inStock=false')).inStock).toBeUndefined();
  });

  it('trims a whitespace-only query to undefined', () => {
    expect(parseFilters(params('q=%20%20')).q).toBeUndefined();
  });
});

describe('buildQueryString', () => {
  it('omits the default sort so the canonical URL stays clean', () => {
    expect(buildQueryString({ sort: DEFAULT_SORT })).toBe('');
  });

  it('includes a non-default sort', () => {
    expect(buildQueryString({ sort: 'rating' })).toBe('sort=rating');
  });

  it('omits inStock when it is not set', () => {
    expect(buildQueryString({ inStock: undefined })).toBe('');
    expect(buildQueryString({ inStock: true })).toBe('inStock=true');
  });

  it('keeps a zero minimum price', () => {
    expect(buildQueryString({ minPrice: 0 })).toBe('minPrice=0');
  });

  it('emits keys in a stable order regardless of object key order', () => {
    // Stability is what makes the output usable as a cache key and a React key.
    const a: CatalogFilters = { minRating: 4, sort: 'rating', minPrice: 100 };
    const b: CatalogFilters = { minPrice: 100, minRating: 4, sort: 'rating' };
    expect(buildQueryString(a)).toBe(buildQueryString(b));
  });

  it('round-trips through parseFilters', () => {
    const original: CatalogFilters = {
      sort: 'price-desc',
      minPrice: 5000,
      maxPrice: 90000,
      minRating: 3,
      inStock: true,
      q: 'kettle',
    };
    expect(parseFilters(params(buildQueryString(original)))).toMatchObject(original);
  });
});

describe('filtersKey', () => {
  it('is "all" for an unfiltered listing', () => {
    expect(filtersKey({})).toBe('all');
  });

  it('treats an explicit default sort as unfiltered', () => {
    expect(filtersKey({ sort: DEFAULT_SORT })).toBe('all');
  });

  it('differs between different filter sets', () => {
    expect(filtersKey({ minRating: 4 })).not.toBe(filtersKey({ minRating: 3 }));
  });

  it('is identical for equivalent filter sets', () => {
    expect(filtersKey({ minRating: 4, inStock: true })).toBe(
      filtersKey({ inStock: true, minRating: 4 }),
    );
  });

  it('distinguishes categories', () => {
    expect(filtersKey({ category: 'books' })).not.toBe(filtersKey({ category: 'beauty' }));
  });
});

describe('productsApiUrl', () => {
  it('builds a first-page URL', () => {
    expect(productsApiUrl({ category: 'books' })).toBe('/api/products?category=books');
  });

  it('appends the cursor for later pages', () => {
    const url = productsApiUrl({ category: 'books' }, { cursor: 'abc123' });
    expect(url).toContain('cursor=abc123');
    expect(url).toContain('category=books');
  });

  it('sends the sort explicitly even when it is the default', () => {
    // buildQueryString omits the default for clean URLs, but the API call should be
    // unambiguous so client and server cannot disagree if the default ever changes.
    expect(productsApiUrl({ sort: DEFAULT_SORT })).toContain('sort=newest');
  });

  it('omits the cursor when null', () => {
    expect(productsApiUrl({}, { cursor: null })).not.toContain('cursor');
  });
});

describe('active filter accounting', () => {
  it('counts a price band as one filter even with both bounds', () => {
    expect(countActiveFilters({ minPrice: 100, maxPrice: 900 })).toBe(1);
  });

  it('counts each distinct filter', () => {
    expect(countActiveFilters({ minPrice: 100, minRating: 4, inStock: true })).toBe(3);
  });

  it('does not count sort, category or search as filters', () => {
    // Those are navigation, not refinement — counting them would make the badge lie.
    expect(countActiveFilters({ sort: 'rating', category: 'books', q: 'x' })).toBe(0);
  });

  it('hasActiveFilters agrees with the count', () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ inStock: true })).toBe(true);
  });
});

describe('clearedFilters', () => {
  it('keeps the browsing context but drops every refinement', () => {
    const cleared = clearedFilters({
      category: 'books',
      q: 'poetry',
      sort: 'rating',
      minPrice: 100,
      maxPrice: 900,
      minRating: 4,
      inStock: true,
    });

    expect(cleared).toEqual({ category: 'books', q: 'poetry', sort: 'rating' });
  });
});
