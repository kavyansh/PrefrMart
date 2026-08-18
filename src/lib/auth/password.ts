import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Password hashing with scrypt from node:crypto — no third-party dependency, and
 * memory-hard rather than a plain digest.
 *
 * Stored format: `scrypt$N$r$p$<saltB64>$<hashB64>`. Embedding the parameters means
 * we can raise the cost later and still verify existing hashes.
 *
 * Node-runtime only: this must never be imported into middleware (Edge runtime).
 */

/**
 * promisify() resolves to the 3-argument overload, losing the options parameter we
 * need to pass N/r/p. The explicit signature keeps the call sites type-checked.
 */
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// N=2^15 keeps an interactive login well under ~150ms while staying memory-hard.
const PARAMS = { N: 32_768, r: 8, p: 1 } as const;

// scrypt needs maxmem >= 128 * N * r, plus headroom.
const MAX_MEM = 128 * PARAMS.N * PARAMS.r * 2;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: MAX_MEM,
  });

  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Constant-time verification. Returns false (never throws) for malformed stored
 * hashes, so a corrupt row cannot turn into a 500 that leaks account existence.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  try {
    const salt = Buffer.from(saltB64!, 'base64');
    const expected = Buffer.from(hashB64!, 'base64');
    if (salt.length === 0 || expected.length === 0) return false;

    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    });

    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
