/**
 * Accessibility audit: colour contrast and page structure.
 *
 * Two things a machine can check reliably, and both are easy to get wrong by eye:
 *
 *  1. Contrast ratios between every foreground/background token pair the design actually uses,
 *     against the WCAG AA thresholds (4.5:1 for body text, 3:1 for large text and UI boundaries).
 *  2. Structural basics on each rendered route — one h1, a main landmark, labelled form controls,
 *     images with an alt attribute, named navigation regions.
 *
 * Not wired into `npm run verify`: it is a diagnostic to run and read, not a gate. Run it with
 * `npx tsx scripts/check-a11y.ts` against a built app (`npm run build` first).
 *
 * What it cannot check: focus order, whether an aria-label reads sensibly, whether the reading
 * sequence makes sense, or anything requiring a real accessibility tree. Those need a browser and a
 * person.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// contrast
// ---------------------------------------------------------------------------

type Rgb = { r: number; g: number; b: number };

function parseHex(hex: string): Rgb {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;

  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

/** Relative luminance, per WCAG 2.1. */
function luminance({ r, g, b }: Rgb): number {
  const channel = (raw: number) => {
    const s = raw / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(foreground: string, background: string): number {
  const a = luminance(parseHex(foreground));
  const b = luminance(parseHex(background));
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Read the token values straight out of globals.css, so this cannot drift from the design. */
function readTokens(): Record<string, string> {
  const css = readFileSync('src/app/globals.css', 'utf8');
  const tokens: Record<string, string> = {};

  for (const match of css.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{3,8});/g)) {
    tokens[match[1]!] = match[2]!;
  }
  return tokens;
}

type Pair = { fg: string; bg: string; label: string; large?: boolean };

/** Only pairs the UI genuinely renders. Auditing every combination would drown the real failures. */
const PAIRS: Pair[] = [
  { fg: 'fg', bg: 'surface', label: 'body text on a card' },
  { fg: 'fg', bg: 'surface-sunken', label: 'body text on the page background' },
  { fg: 'fg-muted', bg: 'surface', label: 'secondary text on a card' },
  { fg: 'fg-muted', bg: 'surface-sunken', label: 'secondary text on the page background' },
  { fg: 'fg-subtle', bg: 'surface', label: 'tertiary text on a card' },
  { fg: 'fg-subtle', bg: 'surface-sunken', label: 'tertiary text on the page background' },
  { fg: 'fg-inverse', bg: 'ink', label: 'header text' },
  { fg: 'accent-fg', bg: 'accent', label: 'primary button label' },
  { fg: 'accent-fg', bg: 'accent-strong', label: 'primary button label, hovered' },
  { fg: 'success', bg: 'success-soft', label: 'success message' },
  { fg: 'danger', bg: 'danger-soft', label: 'error message' },
  { fg: 'warning', bg: 'warning-soft', label: 'warning message' },
  { fg: 'info', bg: 'info-soft', label: 'info message' },
  { fg: 'info', bg: 'surface', label: 'links on a card' },
  { fg: 'price', bg: 'surface', label: 'price' },
  { fg: 'deal', bg: 'surface', label: 'discount label' },
  // Non-text: 3:1 is the threshold for UI component boundaries.
  { fg: 'border-strong', bg: 'surface', label: 'input border', large: true },
  { fg: 'star', bg: 'surface', label: 'filled star', large: true },
  /*
   * star-empty is deliberately omitted.
   *
   * It is the unfilled portion of a rating track and is meant to recede; at 3:1 an empty star reads
   * as a filled one, which costs more comprehension than it buys. Exempt under WCAG 1.4.11 because
   * the stars are aria-hidden and the rating is also given as text — the graphic is decorative, not
   * the sole carrier of the information. Recorded here rather than left as a silent omission.
   */
];

function auditContrast(): number {
  const tokens = readTokens();
  console.log('\nColour contrast (WCAG AA: 4.5:1 text, 3:1 large text and UI)');
  console.log('─'.repeat(78));

  let failures = 0;

  for (const pair of PAIRS) {
    const fg = tokens[pair.fg];
    const bg = tokens[pair.bg];

    if (fg === undefined || bg === undefined) {
      console.log(`  ??   ${pair.label} — token missing (${pair.fg} / ${pair.bg})`);
      failures++;
      continue;
    }

    const ratio = contrastRatio(fg, bg);
    const threshold = pair.large === true ? 3 : 4.5;
    const passes = ratio >= threshold;
    if (!passes) failures++;

    console.log(
      `  ${passes ? 'ok  ' : 'FAIL'} ${ratio.toFixed(2).padStart(5)}:1  (needs ${threshold})  ${pair.label}`,
    );
  }

  return failures;
}

// ---------------------------------------------------------------------------
// structure
// ---------------------------------------------------------------------------

const ROUTES = [
  '/',
  '/c/electronics',
  '/p/kestrel-ultra-webcam-gen-3',
  '/search?q=headphones',
  '/cart',
  '/login',
  '/signup',
  '/offline',
] as const;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('no port'));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

type Finding = { route: string; problem: string };

function auditMarkup(route: string, html: string): Finding[] {
  const findings: Finding[] = [];

  const h1Count = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1Count === 0) findings.push({ route, problem: 'no <h1>' });
  // More than one h1 leaves a screen-reader user without a single "what is this page" anchor.
  if (h1Count > 1) findings.push({ route, problem: `${h1Count} <h1> elements` });

  if (!/<main[\s>]/.test(html)) findings.push({ route, problem: 'no <main> landmark' });
  if (!/id="main"/.test(html)) findings.push({ route, problem: 'no #main skip-link target' });
  if (!/<html lang="/.test(html)) findings.push({ route, problem: 'no lang on <html>' });
  if (!/Skip to main content/.test(html)) findings.push({ route, problem: 'no skip link' });

  // Every <img> needs an alt attribute. Empty alt is correct for decorative images; absent is not.
  for (const tag of html.match(/<img\b[^>]*>/g) ?? []) {
    if (!/\salt=/.test(tag)) {
      findings.push({ route, problem: `<img> without alt: ${tag.slice(0, 70)}` });
    }
  }

  // Text inputs need a label, an aria-label or an aria-labelledby.
  for (const tag of html.match(/<input\b[^>]*>/g) ?? []) {
    const type = /\stype="([^"]+)"/.exec(tag)?.[1] ?? 'text';
    if (['hidden', 'submit', 'button', 'image'].includes(type)) continue;

    const id = /\sid="([^"]+)"/.exec(tag)?.[1];
    const hasAria = /aria-label(?:ledby)?=/.test(tag);
    const hasLabel = id !== undefined && new RegExp(`<label[^>]*for="${id}"`).test(html);
    // A wrapping <label> is also valid and is harder to detect from markup alone.
    if (!hasAria && !hasLabel && id !== undefined) {
      findings.push({ route, problem: `input#${id} may have no accessible name` });
    }
  }

  // Multiple <nav> elements need names, or they are announced identically.
  const navs = html.match(/<nav\b[^>]*>/g) ?? [];
  if (navs.length > 1) {
    const unnamed = navs.filter((tag) => !/aria-label(?:ledby)?=/.test(tag));
    if (unnamed.length > 0) {
      findings.push({ route, problem: `${unnamed.length} of ${navs.length} <nav> elements unnamed` });
    }
  }

  // A positive tabindex overrides the document's natural focus order, which is almost never right.
  if (/tabindex="[1-9]/.test(html)) findings.push({ route, problem: 'positive tabindex found' });

  // Locking zoom is an accessibility failure for anyone who needs to magnify.
  if (/user-scalable=no|maximum-scale=1[^\d]/.test(html)) {
    findings.push({ route, problem: 'zoom is restricted in the viewport meta' });
  }

  return findings;
}

async function auditRoutes(): Promise<number> {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const server: ChildProcess = spawn('npx', ['next', 'start', '-p', String(port)], {
    stdio: 'ignore',
    env: process.env,
  });

  try {
    const deadline = Date.now() + 90_000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      try {
        const response = await fetch(baseUrl);
        ready = response.ok;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    if (!ready) throw new Error('server did not start — run `npm run build` first');

    console.log('\nPage structure');
    console.log('─'.repeat(78));

    const findings: Finding[] = [];
    for (const route of ROUTES) {
      const response = await fetch(`${baseUrl}${route}`);
      const html = await response.text();
      const routeFindings = auditMarkup(route, html);
      findings.push(...routeFindings);

      console.log(`  ${routeFindings.length === 0 ? 'ok  ' : 'FAIL'} ${route}`);
      for (const finding of routeFindings) {
        console.log(`         ${finding.problem}`);
      }
    }

    return findings.length;
  } finally {
    server.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

const contrastFailures = auditContrast();
const structureFailures = await auditRoutes();

console.log('\n' + '─'.repeat(78));
console.log(
  `${contrastFailures} contrast failure(s), ${structureFailures} structural finding(s).`,
);
if (contrastFailures + structureFailures > 0) process.exitCode = 1;
