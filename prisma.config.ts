import { defineConfig } from 'prisma/config';

// Prisma 7 no longer implicitly loads `.env`. Node's built-in loader keeps this
// dependency-free; the try/catch lets CI supply real env vars with no .env file.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env on disk — assume the environment is already populated.
}

/*
 * Read through `process.env` rather than Prisma's `env()` helper, which resolves eagerly and
 * throws when the variable is absent.
 *
 * That distinction is the whole reason the first Vercel deploy failed: `prisma generate` runs in
 * postinstall, loads this file, and `env('DATABASE_URL')` threw before the build ever started —
 * even though `generate` never opens a connection. Leaving the URL undefined lets `generate`
 * succeed anywhere, while `migrate` still fails loudly if it is genuinely missing.
 *
 * Migrations use the direct (non-pooler) connection. DDL through pgbouncer's transaction pooling
 * is not reliable — advisory locks are held per-session, and the pooler does not guarantee the
 * same backend across statements.
 */
const migrationUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: migrationUrl,
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
