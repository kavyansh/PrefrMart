/**
 * Password length policy, kept separate from `password.ts`.
 *
 * `password.ts` imports `node:crypto`, which cannot be bundled for the Edge runtime. The
 * validation schemas need these limits and are reachable from Edge code, so the constants
 * live in this dependency-free module.
 *
 * The maximum is not arbitrary: scrypt cost scales with input, so an unbounded password is a
 * cheap way to make the server do expensive work.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;
