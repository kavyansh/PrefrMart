import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

// scrypt is deliberately slow (that is the point), so these get a longer timeout.
const TIMEOUT = 20_000;

describe('password hashing', () => {
  it(
    'verifies a correct password',
    async () => {
      const stored = await hashPassword('correct horse battery staple');
      expect(await verifyPassword('correct horse battery staple', stored)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'rejects a wrong password',
    async () => {
      const stored = await hashPassword('correct horse battery staple');
      expect(await verifyPassword('Correct horse battery staple', stored)).toBe(false);
      expect(await verifyPassword('', stored)).toBe(false);
    },
    TIMEOUT,
  );

  it(
    'salts each hash, so identical passwords store differently',
    async () => {
      // Without a per-user salt, identical passwords produce identical hashes and a
      // single rainbow table cracks every matching account at once.
      const a = await hashPassword('same-password');
      const b = await hashPassword('same-password');
      expect(a).not.toBe(b);
      expect(await verifyPassword('same-password', a)).toBe(true);
      expect(await verifyPassword('same-password', b)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    'embeds its parameters so cost can be raised later without invalidating hashes',
    async () => {
      const stored = await hashPassword('whatever');
      const [scheme, N, r, p] = stored.split('$');
      expect(scheme).toBe('scrypt');
      expect(Number(N)).toBeGreaterThanOrEqual(16_384);
      expect(Number(r)).toBeGreaterThan(0);
      expect(Number(p)).toBeGreaterThan(0);
    },
    TIMEOUT,
  );

  it(
    'normalises unicode so the same typed password verifies',
    async () => {
      // "é" can be one code point or e + combining accent. A user typing the same
      // visible password on a different keyboard must still get in.
      const composed = 'passwordé';
      const decomposed = 'passwordé';
      const stored = await hashPassword(composed);
      expect(await verifyPassword(decomposed, stored)).toBe(true);
    },
    TIMEOUT,
  );

  describe('malformed stored hashes return false rather than throwing', () => {
    // A corrupt row must not become a 500 — that would leak which accounts exist.
    const cases: Array<[string, string]> = [
      ['empty string', ''],
      ['not our format', 'plaintext-password'],
      ['wrong scheme', 'bcrypt$32768$8$1$c2FsdA==$aGFzaA=='],
      ['too few segments', 'scrypt$32768$8$1$c2FsdA=='],
      ['non-numeric cost', 'scrypt$abc$8$1$c2FsdA==$aGFzaA=='],
      ['empty salt', 'scrypt$32768$8$1$$aGFzaA=='],
      ['empty hash', 'scrypt$32768$8$1$c2FsdA==$'],
    ];

    for (const [label, stored] of cases) {
      it(label, async () => {
        await expect(verifyPassword('any-password', stored)).resolves.toBe(false);
      });
    }
  });
});
