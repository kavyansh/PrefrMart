/**
 * Generates the placeholder product art into public/img/p/*.svg.
 *
 * Why generated SVG instead of stock photos: the demo has to work offline with no
 * external hosts, stay inside a tight byte budget, and be reproducible from a seed.
 * Each file is a few hundred bytes. `lib/catalog/taxonomy.ts` owns the palettes, so
 * swapping in real photography later means changing only `imageSrc()`.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CATEGORIES, IMAGES_PER_CATEGORY, imageKey } from '../src/lib/catalog/taxonomy.ts';
import { CATALOG_SEED, createRng } from '../src/lib/rng.ts';

const OUT_DIR = path.join(process.cwd(), 'public', 'img', 'p');
const WIDTH = 800;
const HEIGHT = 800;

/** A few soft shapes so cards do not all look identical. */
function decorations(rng: ReturnType<typeof createRng>): string {
  const parts: string[] = [];
  const count = rng.int(2, 4);

  for (let i = 0; i < count; i++) {
    const cx = rng.int(80, WIDTH - 80);
    const cy = rng.int(80, HEIGHT - 80);
    const r = rng.int(60, 220);
    const opacity = (rng.int(4, 11) / 100).toFixed(2);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" opacity="${opacity}"/>`);
  }

  return parts.join('');
}

function svgFor(key: string, glyph: string, from: string, to: string, seed: number): string {
  const rng = createRng(seed);
  const gradientId = `g${seed}`;

  // No newlines: keeps the files small and diff-stable.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="Product placeholder">` +
    `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#${gradientId})"/>` +
    decorations(rng) +
    `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="300">${glyph}</text>` +
    `<text x="50%" y="90%" text-anchor="middle" font-family="system-ui,sans-serif" font-size="34" fill="#fff" opacity="0.72">${key}</text>` +
    `</svg>`
  );
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  for (const [categoryIndex, category] of CATEGORIES.entries()) {
    for (let i = 0; i < IMAGES_PER_CATEGORY; i++) {
      const key = imageKey(category.slug, i);
      const seed = CATALOG_SEED + categoryIndex * 1000 + i;
      const svg = svgFor(key, category.glyph, category.palette[0], category.palette[1], seed);
      await writeFile(path.join(OUT_DIR, `${key}.svg`), svg, 'utf8');
      written++;
    }
  }

  console.log(`Generated ${written} placeholder images in public/img/p/`);
}

await main();
