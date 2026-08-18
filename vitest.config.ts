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
     * Test files run one at a time.
     *
     * The integration suites share a single SQLite file and each boots its own server. Run in
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
