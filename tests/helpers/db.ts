/**
 * Direct database access for integration tests, so a test that writes can clean up after
 * itself and stay repeatable. The server under test has its own client; this is a second
 * connection from the test process.
 */

process.loadEnvFile('.env');

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';

export const testDb = new PrismaClient({
  // Direct connection, matching the seed: tests write and clean up, and pooled DDL/tx behaviour
  // is the wrong thing to be debugging inside a test failure.
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
  }),
});

/**
 * Remove reviews created during a test and restore the product's aggregates from what
 * remains — the same derivation the application uses, so cleanup cannot leave the
 * denormalised figures disagreeing with the rows.
 */
export async function deleteReviewsAndRestoreAggregates(productId: string, reviewIds: string[]) {
  if (reviewIds.length > 0) {
    await testDb.review.deleteMany({ where: { id: { in: reviewIds } } });
  }

  const aggregate = await testDb.review.aggregate({
    where: { productId },
    _avg: { rating: true },
    _count: { _all: true },
  });

  await testDb.product.update({
    where: { id: productId },
    data: {
      ratingAvg: Math.round((aggregate._avg.rating ?? 0) * 10) / 10,
      ratingCount: aggregate._count._all,
    },
  });
}
