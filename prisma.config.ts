import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer implicitly loads `.env`. Node's built-in loader keeps this
// dependency-free; the try/catch lets CI supply real env vars with no .env file.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env on disk — assume the environment is already populated.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
