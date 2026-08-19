import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // Node environment: everything unit-tested here is pure logic or server code.
    // Component tests would need jsdom, which is added when there is a component
    // whose behaviour is worth testing in isolation.
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],

    /*
     * Generous timeouts, because the database is now across a network.
     *
     * Vitest's 5s default was comfortable when the integration suites talked to a local SQLite
     * file. Against Neon every query is a round trip — a couple of hundred milliseconds from a
     * developer machine outside us-east-1 — and a test that places an order makes a dozen of
     * them, so the default started failing tests that were behaving perfectly well.
     *
     * These are deliberately far above what a healthy run needs (the suite passes well inside
     * them from CI, where latency is ~1ms) so they still catch a genuine hang. The unit tests are
     * unaffected: they touch no database and finish in milliseconds regardless.
     */
    testTimeout: 30_000,
    hookTimeout: 120_000,

    /*
     * OAuth credentials are required at boot (lib/env.ts), so the suite supplies its own.
     * They must live here rather than in a setup file: the integration suites spawn a real
     * `next start` through tests/helpers/server.ts, which inherits process.env from this
     * process. No test signs in through a live provider — only that the app boots, and that
     * the credentials path and the rejection path behave.
     */
    env: {
      GOOGLE_CLIENT_ID: 'test-google-client-id',
      GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
      GITHUB_CLIENT_ID: 'test-github-client-id',
      GITHUB_CLIENT_SECRET: 'test-github-client-secret',
    },

    /*
     * Test files run one at a time.
     *
     * The integration suites share a single database and each boots its own server. Run in
     * parallel they interfere in ways that look like product bugs: the reviews suite writes
     * reviews, which changes a product's ratingAvg, which shifts the keyset window the
     * pagination suite is walking under `sort=rating` — so a row gets skipped and
     * "yields every product exactly once" fails. Observed exactly that.
     *
     * Ironically it is a faithful demonstration of the hazard the pagination comments describe;
     * it is just not something a test suite should be reproducing by accident. The unit tests
     * run in ~100ms, so serialising everything costs almost nothing.
     */
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
