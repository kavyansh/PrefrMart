import { describe, expect, it } from 'vitest';
import { DEFAULT_REDIRECT, loginUrlFor, sanitizeRedirect } from './redirect';

/**
 * Open-redirect protection.
 *
 * An unvalidated `next` target lets an attacker send a user from our sign-in flow to a
 * look-alike page on a domain they control, primed to harvest whatever is typed next. The only
 * cue is the address bar, and by then the journey has already been trusted.
 */

describe('sanitizeRedirect', () => {
  it('keeps an in-app path', () => {
    expect(sanitizeRedirect('/account/orders')).toBe('/account/orders');
  });

  it('keeps a path with a query string', () => {
    expect(sanitizeRedirect('/c/books?sort=rating')).toBe('/c/books?sort=rating');
  });

  it('falls back for absent input', () => {
    expect(sanitizeRedirect(null)).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect(undefined)).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect('')).toBe(DEFAULT_REDIRECT);
  });

  describe('rejects off-site targets', () => {
    const hostile: ReadonlyArray<readonly [string, string]> = [
      ['absolute https', 'https://evil.example/login'],
      ['absolute http', 'http://evil.example'],
      // Starts with "/" so a naive check passes it, but browsers resolve it as
      // https://evil.example. The classic bypass.
      ['protocol-relative', '//evil.example'],
      ['protocol-relative with path', '//evil.example/pay'],
      // Some browsers normalise the backslash to a forward slash, making this
      // protocol-relative too.
      ['backslash variant', '/\\evil.example'],
      ['bare host', 'evil.example/path'],
      ['javascript scheme', 'javascript:alert(1)'],
      ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ];

    for (const [label, target] of hostile) {
      it(label, () => {
        expect(sanitizeRedirect(target)).toBe(DEFAULT_REDIRECT);
      });
    }
  });

  it('rejects control characters that could smuggle a header newline', () => {
    // Built from char codes rather than written literally, so the intent is unambiguous.
    const CR = String.fromCharCode(13);
    const LF = String.fromCharCode(10);
    const TAB = String.fromCharCode(9);

    expect(sanitizeRedirect(`/account${CR}${LF}Set-Cookie: stolen=1`)).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect(`/account${LF}`)).toBe(DEFAULT_REDIRECT);
    expect(sanitizeRedirect(`/account${TAB}`)).toBe(DEFAULT_REDIRECT);
  });
});

describe('loginUrlFor', () => {
  it('encodes the destination', () => {
    expect(loginUrlFor('/c/books', '?sort=rating')).toBe(
      '/login?next=%2Fc%2Fbooks%3Fsort%3Drating',
    );
  });

  it('sanitises before encoding, so a hostile path cannot round-trip', () => {
    expect(loginUrlFor('//evil.example')).toBe('/login?next=%2F');
  });
});
