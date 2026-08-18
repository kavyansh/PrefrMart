/**
 * Deterministic PRNG (mulberry32) used by the seed script and the image generator.
 *
 * Determinism matters here: the same seed must always produce the same catalog, so
 * the generated placeholder art matches the products that reference it, and so a
 * bug reproduced against a seeded database is reproducible for everyone.
 */
export function createRng(seed: number) {
  let state = seed >>> 0;

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,

    /** Integer in [min, max] inclusive. */
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },

    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('pick() called with an empty array');
      return items[Math.floor(next() * items.length)]!;
    },

    /** `count` distinct members of `items` (or all of them, if count is larger). */
    sample<T>(items: readonly T[], count: number): T[] {
      const pool = [...items];
      const take = Math.min(count, pool.length);
      for (let i = 0; i < take; i++) {
        const j = i + Math.floor(next() * (pool.length - i));
        [pool[i], pool[j]] = [pool[j]!, pool[i]!];
      }
      return pool.slice(0, take);
    },

    bool(probability = 0.5): boolean {
      return next() < probability;
    },
  };
}

export type Rng = ReturnType<typeof createRng>;

/** Shared seed so `gen-images` and `seed` agree on the catalog. */
export const CATALOG_SEED = 20260818;
