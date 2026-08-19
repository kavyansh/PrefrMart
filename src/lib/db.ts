import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { databaseUrl, isProduction } from './env';

/**
 * Prisma 7 takes its connection through a driver adapter rather than a schema URL.
 * We cache the client on globalThis so Next.js dev HMR does not open a new pool
 * on every reload (which would leak connections against Neon's ceiling).
 *
 * This uses the *pooled* (pgbouncer) Neon endpoint deliberately. Serverless functions
 * open a connection per cold start, and a direct connection would exhaust Postgres'
 * backend limit long before traffic became interesting. Migrations are the opposite
 * case and use the direct endpoint — see prisma.config.ts.
 */

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl() });

  return new PrismaClient({
    adapter,
    log: isProduction ? ['error'] : ['error', 'warn'],
  });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (!isProduction) {
  globalForPrisma.prisma = db;
}
