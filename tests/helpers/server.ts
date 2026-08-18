import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

/**
 * Boots the production server for integration tests.
 *
 * Requires a CURRENT `npm run build` — against a stale .next the assertions describe the
 * previous build. This is why `npm run verify` runs build before test.
 *
 * Note: `APP_BASE_URL`, deliberately not `BASE_URL`. Vitest populates BASE_URL from Vite's
 * `base` config, which defaults to "/", so reading it silently yields a relative path and
 * every fetch fails with ERR_INVALID_URL.
 */

export type TestServer = {
  baseUrl: string;
  stop: () => Promise<void>;
};

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Could not determine a free port'));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

export async function startServer(timeoutMs = 90_000): Promise<TestServer> {
  const external = process.env.APP_BASE_URL;
  if (external) {
    return { baseUrl: external, stop: async () => {} };
  }

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const child: ChildProcess = spawn('npx', ['next', 'start', '-p', String(port)], {
    stdio: 'ignore',
    env: process.env,
  });

  const stop = async () => {
    child.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 200));
  };

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return { baseUrl, stop };
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  await stop();
  throw new Error('Server did not start. Did you run `npm run build`?');
}
