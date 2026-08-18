/**
 * All money in this app is integer minor units (paise for INR, cents for USD).
 * Nothing outside this module should do arithmetic on formatted strings or floats.
 */

export const DEFAULT_CURRENCY = 'INR';

/** Minor units per major unit. INR and USD are both 100; kept explicit for clarity. */
const MINOR_PER_MAJOR = 100;

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, maximumFractionDigits: number): Intl.NumberFormat {
  const key = `${currency}:${maximumFractionDigits}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;

  // en-IN gives the lakh/crore grouping Indian shoppers expect (1,20,499).
  const created = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  });
  formatterCache.set(key, created);
  return created;
}

/**
 * Format minor units for display, e.g. 12999 -> "₹129.99".
 * Whole amounts drop the decimals (₹1,299) the way retail listings do.
 */
export function formatMoney(minorUnits: number, currency: string = DEFAULT_CURRENCY): string {
  const isWhole = minorUnits % MINOR_PER_MAJOR === 0;
  return formatter(currency, isWhole ? 0 : 2).format(minorUnits / MINOR_PER_MAJOR);
}

/** Percentage off, rounded to a whole number. Returns null when there is no real discount. */
export function discountPercent(priceCents: number, listCents: number | null): number | null {
  if (listCents === null || listCents <= priceCents) return null;
  const percent = Math.round(((listCents - priceCents) / listCents) * 100);
  return percent > 0 ? percent : null;
}

export type OrderTotals = {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
};

export const FREE_SHIPPING_THRESHOLD_CENTS = 49_900; // ₹499
export const STANDARD_SHIPPING_CENTS = 4_900; // ₹49
export const EXPRESS_SHIPPING_CENTS = 12_900; // ₹129
export const TAX_RATE = 0.18; // flat 18% GST stand-in

export type DeliveryOption = 'standard' | 'express';

export function shippingFor(subtotalCents: number, option: DeliveryOption): number {
  if (option === 'express') return EXPRESS_SHIPPING_CENTS;
  return subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : STANDARD_SHIPPING_CENTS;
}

/**
 * Single source of truth for order arithmetic. The checkout UI and the order API
 * both call this so a client can never talk the server into a different total.
 */
export function computeTotals(
  lines: ReadonlyArray<{ unitCents: number; qty: number }>,
  option: DeliveryOption,
): OrderTotals {
  const subtotalCents = lines.reduce((sum, line) => sum + line.unitCents * line.qty, 0);
  const shippingCents = shippingFor(subtotalCents, option);
  // Tax on goods only — matches how the review step displays it.
  const taxCents = Math.round(subtotalCents * TAX_RATE);

  return {
    subtotalCents,
    shippingCents,
    taxCents,
    totalCents: subtotalCents + shippingCents + taxCents,
  };
}
