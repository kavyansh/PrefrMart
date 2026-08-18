import { describe, expect, it } from 'vitest';
import { clampToStock, mergeCarts, normalizeLines } from './merge';
import { MAX_CART_LINES, MAX_QTY_PER_LINE } from './types';

const ID_A = 'clxq0000000000000000000a';
const ID_B = 'clxq0000000000000000000b';

describe('normalizeLines', () => {
  it('keeps well-formed lines', () => {
    expect(normalizeLines([{ productId: ID_A, qty: 2 }])).toEqual([{ productId: ID_A, qty: 2 }]);
  });

  it('returns empty for non-array input', () => {
    // Lines arrive from IndexedDB, which no schema guards — a corrupt store must degrade to an
    // empty cart, never throw.
    for (const junk of [null, undefined, 'lines', 42, {}]) {
      expect(normalizeLines(junk)).toEqual([]);
    }
  });

  it('sums duplicate product ids into one line', () => {
    // Two entries for one product is a bug in whatever produced them, not a user intent to have
    // two rows — and the database's unique constraint would reject it anyway.
    expect(normalizeLines([
      { productId: ID_A, qty: 2 },
      { productId: ID_A, qty: 3 },
    ])).toEqual([{ productId: ID_A, qty: 5 }]);
  });

  it('drops malformed entries without discarding the good ones', () => {
    const result = normalizeLines([
      { productId: ID_A, qty: 1 },
      { productId: '', qty: 1 },
      { productId: ID_B },
      { qty: 4 },
      null,
      'nonsense',
      { productId: ID_B, qty: 2 },
    ]);
    expect(result).toEqual([
      { productId: ID_A, qty: 1 },
      { productId: ID_B, qty: 2 },
    ]);
  });

  it('rejects a product id that is not a plausible record id', () => {
    // Stops a hostile value reaching the query layer as an arbitrary string.
    for (const bad of ['../../etc/passwd', "' OR 1=1 --", 'short', 'has spaces in it here yes']) {
      expect(normalizeLines([{ productId: bad, qty: 1 }])).toEqual([]);
    }
  });

  it('drops zero and negative quantities', () => {
    expect(normalizeLines([
      { productId: ID_A, qty: 0 },
      { productId: ID_B, qty: -5 },
    ])).toEqual([]);
  });

  it('truncates fractional quantities', () => {
    expect(normalizeLines([{ productId: ID_A, qty: 2.9 }])).toEqual([{ productId: ID_A, qty: 2 }]);
  });

  it('caps quantity per line', () => {
    expect(normalizeLines([{ productId: ID_A, qty: 9999 }])).toEqual([
      { productId: ID_A, qty: MAX_QTY_PER_LINE },
    ]);
  });

  it('caps the number of distinct lines', () => {
    // Bounds how many ids a single request can put into an IN clause.
    const many = Array.from({ length: MAX_CART_LINES + 20 }, (_, index) => ({
      productId: `clxq${String(index).padStart(20, '0')}`,
      qty: 1,
    }));
    expect(normalizeLines(many)).toHaveLength(MAX_CART_LINES);
  });
});

describe('mergeCarts', () => {
  it('sums quantities rather than overwriting', () => {
    /*
     * The behaviour that matters on sign-in. Overwriting would silently discard whichever basket
     * the shopper did not touch most recently, and they have no way to know which that was.
     */
    expect(
      mergeCarts([{ productId: ID_A, qty: 2 }], [{ productId: ID_A, qty: 3 }]),
    ).toEqual([{ productId: ID_A, qty: 5 }]);
  });

  it('keeps lines unique to either side', () => {
    const merged = mergeCarts([{ productId: ID_A, qty: 1 }], [{ productId: ID_B, qty: 2 }]);
    expect(merged).toHaveLength(2);
    expect(merged).toEqual(
      expect.arrayContaining([
        { productId: ID_A, qty: 1 },
        { productId: ID_B, qty: 2 },
      ]),
    );
  });

  it('caps the summed quantity', () => {
    // 8 + 8 must become the cap, not 16.
    expect(
      mergeCarts([{ productId: ID_A, qty: 8 }], [{ productId: ID_A, qty: 8 }]),
    ).toEqual([{ productId: ID_A, qty: MAX_QTY_PER_LINE }]);
  });

  it('handles either side being empty', () => {
    expect(mergeCarts([], [{ productId: ID_A, qty: 2 }])).toEqual([{ productId: ID_A, qty: 2 }]);
    expect(mergeCarts([{ productId: ID_A, qty: 2 }], [])).toEqual([{ productId: ID_A, qty: 2 }]);
    expect(mergeCarts([], [])).toEqual([]);
  });
});

describe('clampToStock', () => {
  it('leaves an affordable quantity alone and reports no clamp', () => {
    expect(clampToStock(3, 10)).toEqual({ qty: 3, clampedFrom: null });
  });

  it('reduces to available stock and reports the original', () => {
    /*
     * Returning the original is what lets the UI say "only 3 left, reduced from 9" instead of
     * silently changing the number under the shopper's cursor.
     */
    expect(clampToStock(9, 3)).toEqual({ qty: 3, clampedFrom: 9 });
  });

  it('reduces to the per-line cap even when stock is plentiful', () => {
    expect(clampToStock(50, 500)).toEqual({ qty: MAX_QTY_PER_LINE, clampedFrom: 50 });
  });

  it('returns zero for an out-of-stock product, and says so', () => {
    expect(clampToStock(2, 0)).toEqual({ qty: 0, clampedFrom: 2 });
  });

  it('handles exactly-enough stock as no clamp', () => {
    // Boundary: requesting precisely what is left is not a reduction.
    expect(clampToStock(3, 3)).toEqual({ qty: 3, clampedFrom: null });
  });
});
