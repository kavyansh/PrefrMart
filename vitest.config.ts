import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Two projects, because two kinds of test with genuinely different needs live here.
 *
 * `unit` is the original suite: pure logic and server code in Node, plus the integration suites
 * that boot a real `next start` and talk to Neon. Those need long timeouts and serial execution.
 *
 * `components` renders React in jsdom. It touches no network and no database, so it wants none of
 * that — default timeouts, files in parallel. Sharing one config would mean either giving the
 * component tests the integration suite's 30-second timeouts and serial execution, or putting the
 * integration suites inside a fake DOM. Neither is worth it.
 *
 * Both run under `npm test`, so `npm run verify` covers them without a new script.
 * `npx vitest run --project components` runs just the fast half.
 */

/** Shared by both projects: the `@` alias the app imports through. */
const resolve = {
  alias: {
    '@': path.resolve(import.meta.dirname, 'src'),
  },
};

/*
 * OAuth credentials are required at boot (lib/env.ts), so the suite supplies its own.
 *
 * They must live in config rather than a setup file: the integration suites spawn a real
 * `next start` through tests/helpers/server.ts, which inherits process.env from this process, and a
 * setup file runs too late to be inherited. No test signs in through a live provider — only that
 * the app boots, and that the credentials path and the rejection path behave.
 */
const authEnv = {
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  GITHUB_CLIENT_ID: 'test-github-client-id',
  GITHUB_CLIENT_SECRET: 'test-github-client-secret',
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve,
        test: {
          name: 'unit',
          // Node environment: everything here is pure logic, server code, or an HTTP client
          // talking to a server in another process. Nothing renders.
          environment: 'node',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
          env: authEnv,

          /*
           * Generous timeouts, because the database is now across a network.
           *
           * Vitest's 5s default was comfortable when the integration suites talked to a local
           * SQLite file. Against Neon every query is a round trip — a couple of hundred
           * milliseconds from a developer machine outside us-east-1 — and a test that places an
           * order makes a dozen of them, so the default started failing tests that were behaving
           * perfectly well.
           *
           * These are deliberately far above what a healthy run needs (the suite passes well
           * inside them from CI, where latency is ~1ms) so they still catch a genuine hang. The
           * unit tests are unaffected: they touch no database and finish in milliseconds
           * regardless.
           */
          testTimeout: 30_000,
          hookTimeout: 120_000,

          /*
           * Test files run one at a time.
           *
           * The integration suites share a single database and each boots its own server. Run in
           * parallel they interfere in ways that look like product bugs: the reviews suite writes
           * reviews, which changes a product's ratingAvg, which shifts the keyset window the
           * pagination suite is walking under `sort=rating` — so a row gets skipped and
           * "yields every product exactly once" fails. Observed exactly that.
           *
           * Ironically it is a faithful demonstration of the hazard the pagination comments
           * describe; it is just not something a test suite should be reproducing by accident. The
           * unit tests run in ~100ms, so serialising everything costs almost nothing.
           */
          fileParallelism: false,
        },
      },
      {
        // The React transform, so JSX in a .test.tsx compiles and Fast Refresh boilerplate is
        // stripped. Only this project needs it; adding it globally would run it over the
        // integration suites too.
        plugins: [react()],
        resolve,
        test: {
          name: 'components',
          environment: 'jsdom',
          // .tsx only. Keeping the extension as the boundary means a test file cannot end up in
          // the wrong project by accident.
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./tests/setup/components.ts'],
          env: authEnv,
        },
      },
    ],
  },
});
