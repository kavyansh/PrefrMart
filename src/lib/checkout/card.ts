/**
 * Mock card validation.
 *
 * No card data is transmitted, stored or logged anywhere: these checks run entirely in the
 * browser, and the only thing the order records is a display label like "Card ending 4242".
 * The point is a realistic checkout that catches typos, not a payment integration.
 *
 * Pure functions with no dependencies, so the rules are directly testable.
 */

/**
 * Luhn checksum — the check digit every real card number carries.
 *
 * This is what catches a transposed pair of digits, which a length check alone cannot. It is a
 * typo detector, not an authenticity test: a Luhn-valid number is not necessarily a real card.
 */
export function isLuhnValid(cardNumber: string): boolean {
  const digits = cardNumber.replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(digits)) return false;

  let sum = 0;
  let double = false;

  // Right to left: every second digit is doubled, and a result over 9 has 9 subtracted.
  for (let i = digits.length - 1; i >= 0; i--) {
    let value = digits.charCodeAt(i) - 48;

    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }

    sum += value;
    double = !double;
  }

  return sum % 10 === 0;
}

/** Recognised brands, for the display label only. */
export type CardBrand = 'Visa' | 'Mastercard' | 'Amex' | 'RuPay' | 'Card';

export function detectBrand(cardNumber: string): CardBrand {
  const digits = cardNumber.replace(/[\s-]/g, '');

  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'Amex';
  if (/^(60|65|81|82|508)/.test(digits)) return 'RuPay';
  return 'Card';
}

export type ExpiryCheck = { valid: true; month: number; year: number } | { valid: false; reason: string };

/**
 * Validate an MM/YY expiry against a supplied "now".
 *
 * `now` is a parameter rather than being read inside, so the boundary behaviour — a card
 * expiring in the current month is still valid — is testable without freezing the clock.
 */
export function checkExpiry(input: string, now: Date): ExpiryCheck {
  const match = /^(\d{2})\s*\/?\s*(\d{2})$/.exec(input.trim());
  if (match === null) return { valid: false, reason: 'Use MM/YY.' };

  const month = Number(match[1]);
  const shortYear = Number(match[2]);
  if (month < 1 || month > 12) return { valid: false, reason: 'That month does not exist.' };

  // Two-digit years are this century; a card is not expiring in 1998.
  const year = 2000 + shortYear;

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // A card is valid through the last day of its stated month, so equality passes.
  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return { valid: false, reason: 'That card has expired.' };
  }

  // Cards are not issued more than ~20 years out; anything beyond is a typo.
  if (year > currentYear + 20) return { valid: false, reason: 'Check the expiry year.' };

  return { valid: true, month, year };
}

/** Amex uses a 4-digit CVV; everything else uses 3. */
export function isCvcValid(cvc: string, brand: CardBrand): boolean {
  const expected = brand === 'Amex' ? 4 : 3;
  return new RegExp(`^\\d{${expected}}$`).test(cvc.trim());
}

/**
 * The label stored on the order. Deliberately the only thing derived from the card number that
 * ever leaves the browser — a brand and the last four digits, which is what a receipt shows.
 */
export function paymentLabel(cardNumber: string): string {
  const digits = cardNumber.replace(/[\s-]/g, '');
  return `${detectBrand(digits)} ending ${digits.slice(-4)}`;
}

/** Group digits for readability as the user types. Amex groups 4-6-5. */
export function formatCardNumber(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 19);
  const groups = detectBrand(digits) === 'Amex' ? [4, 6, 5] : [4, 4, 4, 4, 3];

  const parts: string[] = [];
  let offset = 0;
  for (const size of groups) {
    if (offset >= digits.length) break;
    parts.push(digits.slice(offset, offset + size));
    offset += size;
  }

  return parts.join(' ');
}
