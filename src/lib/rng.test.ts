import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('is deterministic for a given seed', () => {
    // This is the property the whole seeded demo rests on: same seed, same catalog.
    const a = createRng(42);
    const b = createRng(42);
    const drawsA = Array.from({ length: 20 }, () => a.next());
    const drawsB = Array.from({ length: 20 }, () => b.next());
    expect(drawsA).toEqual(drawsB);
  });

  it('produces different streams for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('stays within [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  describe('int', () => {
    it('is inclusive at both ends', () => {
      const rng = createRng(99);
      const seen = new Set<number>();
      for (let i = 0; i < 400; i++) seen.add(rng.int(1, 3));
      expect([...seen].sort()).toEqual([1, 2, 3]);
    });

    it('handles a single-value range', () => {
      const rng = createRng(5);
      expect(rng.int(4, 4)).toBe(4);
    });
  });

  describe('pick', () => {
    it('always returns a member of the array', () => {
      const rng = createRng(11);
      const items = ['a', 'b', 'c'] as const;
      for (let i = 0; i < 100; i++) {
        expect(items).toContain(rng.pick(items));
      }
    });

    it('throws on an empty array rather than returning undefined', () => {
      // Returning undefined here would surface much later as a broken product row.
      const rng = createRng(1);
      expect(() => rng.pick([])).toThrow(/empty array/);
    });
  });

  describe('sample', () => {
    it('returns distinct members', () => {
      const rng = createRng(3);
      const items = [1, 2, 3, 4, 5, 6, 7, 8];
      const picked = rng.sample(items, 4);
      expect(picked).toHaveLength(4);
      expect(new Set(picked).size).toBe(4);
      for (const value of picked) expect(items).toContain(value);
    });

    it('caps at the pool size instead of padding or repeating', () => {
      const rng = createRng(3);
      expect(rng.sample([1, 2], 10)).toHaveLength(2);
    });

    it('returns an empty array for a zero count', () => {
      const rng = createRng(3);
      expect(rng.sample([1, 2, 3], 0)).toEqual([]);
    });

    it('does not mutate the input array', () => {
      const rng = createRng(3);
      const items = [1, 2, 3, 4, 5];
      rng.sample(items, 3);
      expect(items).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('bool', () => {
    it('respects the probability, roughly', () => {
      const rng = createRng(21);
      let trueCount = 0;
      const iterations = 4_000;
      for (let i = 0; i < iterations; i++) if (rng.bool(0.25)) trueCount++;
      // Wide tolerance: this asserts the parameter is wired up, not the quality of
      // the distribution.
      expect(trueCount / iterations).toBeGreaterThan(0.2);
      expect(trueCount / iterations).toBeLessThan(0.3);
    });

    it('never returns true at probability 0', () => {
      const rng = createRng(1);
      for (let i = 0; i < 200; i++) expect(rng.bool(0)).toBe(false);
    });
  });
});
