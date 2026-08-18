import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // Node environment: everything unit-tested here is pure logic or server code.
    // Component tests would need jsdom, which is added when there is a component
    // whose behaviour is worth testing in isolation.
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
