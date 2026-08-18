import { describe, expect, it } from 'vitest';
import {
  computeTotals,
  discountPercent,
  EXPRESS_SHIPPING_CENTS,
  formatMoney,
  FREE_SHIPPING_THRESHOLD_CENTS,
  shippingFor,
  STANDARD_SHIPPING_CENTS,
  TAX_RATE,
} from './money';

describe('formatMoney', () => {
  it('drops decimals for whole amounts', () => {
    expect(formatMoney(129_900)).toBe('₹1,299');
  });

  it('keeps decimals when there is a paise component', () => {
    expect(formatMoney(129_949)).toBe('₹1,299.49');
  });

  it('uses Indian lakh grouping', () => {
    // 1,23,456 rather than 123,456 — this is the whole reason for the en-IN locale.
    expect(formatMoney(1_23_45_600)).toBe('₹1,23,456');
  });

  it('formats zero', () => {
    expect(formatMoney(0)).toBe('₹0');
  });
});

describe('discountPercent', () => {
  it('returns null when there is no list price', () => {
    expect(discountPercent(10_000, null)).toBeNull();
  });

  it('returns null when the list price is not actually higher', () => {
    // Guards against a seeded or mistyped list price that would render "0% off".
    expect(discountPercent(10_000, 10_000)).toBeNull();
    expect(discountPercent(10_000, 9_000)).toBeNull();
  });

  it('rounds to a whole percentage', () => {
    expect(discountPercent(7_500, 10_000)).toBe(25);
    expect(discountPercent(6_667, 10_000)).toBe(33);
  });
});

describe('shippingFor', () => {
  it('charges standard shipping below the free threshold', () => {
    expect(shippingFor(FREE_SHIPPING_THRESHOLD_CENTS - 1, 'standard')).toBe(
      STANDARD_SHIPPING_CENTS,
    );
  });

  it('is free at exactly the threshold', () => {
    // Boundary: the threshold itself must qualify, not just amounts above it.
    expect(shippingFor(FREE_SHIPPING_THRESHOLD_CENTS, 'standard')).toBe(0);
  });

  it('always charges for express, however large the basket', () => {
    expect(shippingFor(10_00_000, 'express')).toBe(EXPRESS_SHIPPING_CENTS);
  });
});

describe('computeTotals', () => {
  it('multiplies unit price by quantity', () => {
    const totals = computeTotals([{ unitCents: 10_000, qty: 3 }], 'standard');
    expect(totals.subtotalCents).toBe(30_000);
  });

  it('sums multiple lines', () => {
    const totals = computeTotals(
      [
        { unitCents: 10_000, qty: 2 },
        { unitCents: 2_550, qty: 1 },
      ],
      'standard',
    );
    expect(totals.subtotalCents).toBe(22_550);
  });

  it('taxes goods only, not shipping', () => {
    // A basket under the free-shipping threshold pays shipping; tax must still be
    // computed on the subtotal alone.
    const totals = computeTotals([{ unitCents: 10_000, qty: 1 }], 'standard');
    expect(totals.taxCents).toBe(Math.round(10_000 * TAX_RATE));
    expect(totals.totalCents).toBe(10_000 + STANDARD_SHIPPING_CENTS + totals.taxCents);
  });

  it('produces integer cents for a tax amount that does not divide evenly', () => {
    const totals = computeTotals([{ unitCents: 3_333, qty: 1 }], 'express');
    expect(Number.isInteger(totals.taxCents)).toBe(true);
    expect(Number.isInteger(totals.totalCents)).toBe(true);
  });

  it('handles an empty basket without producing NaN', () => {
    const totals = computeTotals([], 'standard');
    expect(totals.subtotalCents).toBe(0);
    expect(totals.taxCents).toBe(0);
    // An empty basket below the threshold still technically quotes shipping; the
    // checkout UI never reaches this state, but the arithmetic must stay finite.
    expect(Number.isFinite(totals.totalCents)).toBe(true);
  });
});
