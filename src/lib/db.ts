import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@/generated/prisma/client';
import { databaseUrl, isProduction } from './env';

/**
 * Prisma 7 takes its connection through a driver adapter rather than a schema URL.
 * We cache the client on globalThis so Next.js dev HMR does not open a new SQLite
 * handle on every reload (which exhausts file descriptors and locks the db).
 */

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl() });

  return new PrismaClient({
    adapter,
    log: isProduction ? ['error'] : ['error', 'warn'],
  });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (!isProduction) {
  globalForPrisma.prisma = db;
}
