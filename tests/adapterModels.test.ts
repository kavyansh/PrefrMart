import { describe, expect, it } from 'vitest';
import { testDb } from './helpers/db';

/**
 * The Prisma client must expose every model `@auth/prisma-adapter` reaches for.
 *
 * This exists because of a real failure. The schema gained Account/Session/VerificationToken,
 * but the generated client was not rebuilt — `prisma migrate dev` does not always regenerate
 * it — so `prisma.account` was undefined and every OAuth sign-in died inside the adapter with
 * "Cannot read properties of undefined (reading 'findUnique')". It reached the sign-in page as
 * a `Configuration` error. Nothing else in the suite touches those delegates, so nothing
 * caught the drift.
 *
 * Delegates are created per client instance in Prisma 7, not on the prototype, so this has to
 * look at a real instance. It issues no query beyond a count.
 */
describe('prisma client exposes the Auth.js adapter models', () => {
  it.each(['user', 'account', 'session', 'verificationToken'] as const)(
    'has db.%s',
    async (model) => {
      const delegate = (testDb as unknown as Record<string, { count?: () => Promise<number> }>)[
        model
      ];

      expect(
        delegate,
        `db.${model} is missing — run \`npx prisma generate\` after changing the schema`,
      ).toBeDefined();

      // Prove it is a live delegate rather than an incidental property.
      await expect(delegate!.count!()).resolves.toBeTypeOf('number');
    },
  );
});
