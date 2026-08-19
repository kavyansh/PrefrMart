/**
 * Password length policy, kept separate from `password.ts`.
 *
 * Originally this split existed because `password.ts` imports `node:crypto`, which could not
 * be bundled for the Edge runtime that middleware once ran on. Since Next 16 the proxy runs
 * on Node, so that constraint is gone — but the split is still worth keeping: the validation
 * schemas need these two numbers and nothing else, and a dependency-free module means
 * importing them never drags scrypt along.
 *
 * The maximum is not arbitrary: scrypt cost scales with input, so an unbounded password is a
 * cheap way to make the server do expensive work.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;
