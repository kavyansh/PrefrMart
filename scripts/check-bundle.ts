/**
 * First-load JavaScript budget check.
 *
 * Measures what a modern browser actually downloads for a route, rather than
 * trusting a build manifest: boot the production server, fetch each route's HTML,
 * collect its <script> URLs, and gzip each one.
 *
 * Two deliberate choices:
 *  - `noModule` scripts are excluded. Next emits a ~39KB core-js polyfill bundle
 *    with that attribute, and modern browsers skip it entirely, so counting it would
 *    overstate real-world cost.
 *  - Sizes are gzipped, because that is what crosses the wire.
 *
 * Turbopack (Next 16) no longer writes app-build-manifest.json, so parsing manifests
 * is both fragile and version-dependent. This approach survives upgrades.
 *
 * Usage:  npm run check:bundle          (boots its own server against .next/)
 *         APP_BASE_URL=… npm run check:bundle   (measures an already-running server)
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { createServer } from 'node:net';

/**
 * Budgets in KB of gzipped, module-loaded JS.
 *
 * FRAMEWORK_FLOOR_KB is what Next 16 + React 19 ship on their own, measured with zero
 * client components in the tree. The original 150KB first-load target is not reachable
 * with this framework — see README. Re-measure and update this when upgrading Next.
 *
 * APP_CODE_BUDGET_KB is the number that actually reflects our own work: everything above
 * the floor. It is the useful signal day to day, and it is what caught the whole of zod
 * being pulled into the browser bundle by one const import (70KB).
 */
const FRAMEWORK_FLOOR_KB = 138.8;
const BUDGET_KB = 185;
const APP_CODE_BUDGET_KB = 45;

/** Routes to measure. Each must be reachable with a GET and return HTML. */
const ROUTES = ['/', '/c/electronics', '/p/kestrel-ultra-webcam-gen-3'] as const;

const KB = 1024;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Could not determine a free port'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(baseUrl: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl, { method: 'GET' });
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Server at ${baseUrl} did not become ready in ${timeoutMs}ms`);
}

/**
 * Extract script URLs a modern browser would execute.
 * Anything carrying `noModule` is skipped — see the note at the top of the file.
 */
function moduleScriptUrls(html: string): string[] {
  const urls = new Set<string>();
  const scriptTag = /<script\b([^>]*)>/gi;

  for (const match of html.matchAll(scriptTag)) {
    const attrs = match[1] ?? '';
    if (/\bnoModule\b/i.test(attrs)) continue;

    const src = /\bsrc="([^"]+)"/i.exec(attrs)?.[1];
    if (!src) continue;

    // Only count real JS assets; /_next/image is not script.
    const decoded = src.replace(/&amp;/g, '&');
    if (decoded.startsWith('/_next/static/') && decoded.endsWith('.js')) {
      urls.add(decoded);
    }
  }

  return [...urls].sort();
}

type RouteMeasurement = {
  route: string;
  urls: string[];
  sizes: Map<string, number>;
  totalBytes: number;
};

async function measureRoute(baseUrl: string, route: string): Promise<RouteMeasurement> {
  const response = await fetch(`${baseUrl}${route}`);
  if (!response.ok) {
    throw new Error(`GET ${route} returned ${response.status}`);
  }

  const html = await response.text();
  const urls = moduleScriptUrls(html);

  const sizes = new Map<string, number>();
  let totalBytes = 0;

  for (const url of urls) {
    const assetResponse = await fetch(`${baseUrl}${url}`);
    if (!assetResponse.ok) {
      throw new Error(`GET ${url} returned ${assetResponse.status}`);
    }
    const body = Buffer.from(await assetResponse.arrayBuffer());
    const gzipped = gzipSync(body, { level: 9 }).byteLength;
    sizes.set(url, gzipped);
    totalBytes += gzipped;
  }

  return { route, urls, sizes, totalBytes };
}

function formatKb(bytes: number): string {
  return `${(bytes / KB).toFixed(1)} KB`;
}

async function main(): Promise<void> {
  const providedBaseUrl = process.env.APP_BASE_URL;
  let server: ChildProcess | undefined;
  let baseUrl = providedBaseUrl ?? '';

  if (!providedBaseUrl) {
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    console.log(`Starting production server on ${baseUrl}…`);

    server = spawn('npx', ['next', 'start', '-p', String(port)], {
      stdio: 'ignore',
      env: process.env,
    });
  }

  try {
    await waitForServer(baseUrl);

    const measurements: RouteMeasurement[] = [];
    for (const route of ROUTES) {
      measurements.push(await measureRoute(baseUrl, route));
    }

    /*
     * App code is measured against the recorded framework floor, not against the chunks
     * routes have in common. An intersection sounds smarter but is useless in practice:
     * when every route loads the same client bundle it reports 0 KB of app code no matter
     * how large that bundle grows.
     */
    const floorBytes = FRAMEWORK_FLOOR_KB * KB;

    const shared = measurements
      .map((measurement) => new Set(measurement.urls))
      .reduce((intersection, urls) => {
        if (intersection === null) return urls;
        return new Set([...intersection].filter((url) => urls.has(url)));
      }, null as Set<string> | null) ?? new Set<string>();

    console.log(`\nFramework floor: ${FRAMEWORK_FLOOR_KB} KB · ${shared.size} chunks shared across routes`);
    console.log('─'.repeat(70));

    const failures: string[] = [];

    for (const measurement of measurements) {
      const appBytes = measurement.totalBytes - floorBytes;
      const overTotal = measurement.totalBytes > BUDGET_KB * KB;
      const overApp = appBytes > APP_CODE_BUDGET_KB * KB;

      const flag = overTotal || overApp ? 'FAIL' : 'ok  ';
      console.log(
        `${flag} ${measurement.route.padEnd(30)} total ${formatKb(measurement.totalBytes).padStart(9)}` +
          `   app code ${formatKb(appBytes).padStart(9)}`,
      );

      if (overTotal) {
        failures.push(
          `${measurement.route}: first-load JS ${formatKb(measurement.totalBytes)} exceeds ${BUDGET_KB} KB`,
        );
      }
      if (overApp) {
        failures.push(
          `${measurement.route}: app code ${formatKb(appBytes)} above the framework floor ` +
            `exceeds ${APP_CODE_BUDGET_KB} KB`,
        );
      }
    }

    console.log('─'.repeat(70));
    console.log(`Budgets: total ${BUDGET_KB} KB · app code ${APP_CODE_BUDGET_KB} KB (gzipped)`);

    if (failures.length > 0) {
      console.error('\nBundle budget exceeded:');
      for (const failure of failures) console.error(`  - ${failure}`);
      process.exitCode = 1;
      return;
    }

    console.log('\nAll routes within budget.');
  } finally {
    if (server) {
      server.kill('SIGTERM');
      // Give it a beat to release the port before the process exits.
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

await main();
