import { describe, expect, it } from 'vitest';
import {
  checkExpiry,
  detectBrand,
  formatCardNumber,
  isCvcValid,
  isLuhnValid,
  paymentLabel,
} from './card';

describe('isLuhnValid', () => {
  it('accepts known-good test numbers', () => {
    for (const number of [
      '4242424242424242', // Visa
      '5555555555554444', // Mastercard
      '378282246310005', // Amex
      '6011111111111117', // Discover
    ]) {
      expect(isLuhnValid(number), number).toBe(true);
    }
  });

  it('accepts a number with spaces or dashes', () => {
    expect(isLuhnValid('4242 4242 4242 4242')).toBe(true);
    expect(isLuhnValid('4242-4242-4242-4242')).toBe(true);
  });

  it('rejects a single wrong digit', () => {
    expect(isLuhnValid('4242424242424243')).toBe(false);
  });

  it('rejects a mid-number transposed pair of digits', () => {
    /*
     * The case a length or prefix check cannot catch, and the whole reason to run a checksum: both
     * of these are 16 digits, both start with 4, both look entirely plausible. Only the second and
     * third digits of "0071" are swapped.
     *
     * Both numbers were computed, not invented — a hand-written "valid" number usually is not.
     */
    expect(isLuhnValid('4024007197262479')).toBe(true);
    expect(isLuhnValid('4024070197262479')).toBe(false);
  });

  it('rejects non-digits and wrong lengths', () => {
    for (const bad of ['', 'abcdefghijklmnop', '4242', '42424242424242424242424', '4242 42a2 4242 4242']) {
      expect(isLuhnValid(bad), bad).toBe(false);
    }
  });
});

describe('detectBrand', () => {
  it('identifies the major brands from their prefix', () => {
    expect(detectBrand('4242424242424242')).toBe('Visa');
    expect(detectBrand('5555555555554444')).toBe('Mastercard');
    expect(detectBrand('2223003122003222')).toBe('Mastercard');
    expect(detectBrand('378282246310005')).toBe('Amex');
    expect(detectBrand('6521000000000000')).toBe('RuPay');
  });

  it('falls back to a generic label rather than guessing', () => {
    expect(detectBrand('9999999999999999')).toBe('Card');
    expect(detectBrand('')).toBe('Card');
  });
});

describe('checkExpiry', () => {
  const june2026 = new Date(Date.UTC(2026, 5, 15));

  it('accepts a future date', () => {
    expect(checkExpiry('12/29', june2026)).toEqual({ valid: true, month: 12, year: 2029 });
  });

  it('accepts the current month', () => {
    // A card is valid through the last day of its stated month, so equality must pass.
    expect(checkExpiry('06/26', june2026)).toMatchObject({ valid: true });
  });

  it('rejects last month', () => {
    expect(checkExpiry('05/26', june2026)).toMatchObject({ valid: false });
  });

  it('rejects a past year', () => {
    expect(checkExpiry('12/25', june2026)).toMatchObject({ valid: false });
  });

  it('accepts a slash-free or spaced form', () => {
    expect(checkExpiry('1229', june2026)).toMatchObject({ valid: true });
    expect(checkExpiry(' 12 / 29 ', june2026)).toMatchObject({ valid: true });
  });

  it('rejects an impossible month', () => {
    expect(checkExpiry('13/29', june2026)).toMatchObject({ valid: false });
    expect(checkExpiry('00/29', june2026)).toMatchObject({ valid: false });
  });

  it('rejects a year absurdly far out, which is a typo', () => {
    expect(checkExpiry('12/99', june2026)).toMatchObject({ valid: false });
  });

  it('rejects unparseable input', () => {
    for (const bad of ['', 'soon', '1/29', '12/2029', '12-29-2029']) {
      expect(checkExpiry(bad, june2026), bad).toMatchObject({ valid: false });
    }
  });
});

describe('isCvcValid', () => {
  it('wants 3 digits for most brands', () => {
    expect(isCvcValid('123', 'Visa')).toBe(true);
    expect(isCvcValid('1234', 'Visa')).toBe(false);
    expect(isCvcValid('12', 'Visa')).toBe(false);
  });

  it('wants 4 digits for Amex', () => {
    expect(isCvcValid('1234', 'Amex')).toBe(true);
    expect(isCvcValid('123', 'Amex')).toBe(false);
  });

  it('rejects non-digits', () => {
    expect(isCvcValid('12a', 'Visa')).toBe(false);
    expect(isCvcValid('', 'Visa')).toBe(false);
  });
});

describe('paymentLabel', () => {
  it('records only the brand and last four digits', () => {
    /*
     * This is the single value derived from the card that ever leaves the browser. If this ever
     * returned more, the order table would be storing card data.
     */
    expect(paymentLabel('4242 4242 4242 4242')).toBe('Visa ending 4242');
    expect(paymentLabel('378282246310005')).toBe('Amex ending 0005');
  });

  it('never contains the full number', () => {
    const label = paymentLabel('4242424242424242');
    expect(label).not.toContain('424242424242');
  });
});

describe('formatCardNumber', () => {
  it('groups in fours', () => {
    expect(formatCardNumber('4242424242424242')).toBe('4242 4242 4242 4242');
  });

  it('groups Amex as 4-6-5', () => {
    expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005');
  });

  it('strips non-digits as the user types', () => {
    expect(formatCardNumber('4242-abc 4242')).toBe('4242 4242');
  });

  it('caps at the longest real card length', () => {
    expect(formatCardNumber('1'.repeat(30)).replace(/ /g, '')).toHaveLength(19);
  });
});
