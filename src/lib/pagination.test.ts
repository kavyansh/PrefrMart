import { describe, expect, it } from 'vitest';
import {
  clampLimit,
  DEFAULT_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetArgs,
  MAX_PAGE_SIZE,
  toPage,
} from './pagination';

const VALID_ID = 'clxq1a2b3c4d5e6f7g8h9i0j';

describe('cursor encoding', () => {
  it('round-trips a record id', () => {
    expect(decodeCursor(encodeCursor(VALID_ID))).toBe(VALID_ID);
  });

  it('produces a URL-safe token', () => {
    // base64url must never contain +, / or = — those break in query strings.
    const cursor = encodeCursor(VALID_ID);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('treats missing input as the first page', () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });

  it('rejects a cursor that decodes to something other than an id', () => {
    // A hostile cursor must not reach the query layer as an arbitrary string.
    const injection = Buffer.from("'; DROP TABLE Product; --", 'utf8').toString('base64url');
    expect(decodeCursor(injection)).toBeNull();
  });

  it('rejects non-base64 junk without throwing', () => {
    expect(decodeCursor('!!!not base64!!!')).toBeNull();
  });

  it('rejects a decoded value that is too short to be an id', () => {
    expect(decodeCursor(Buffer.from('abc', 'utf8').toString('base64url'))).toBeNull();
  });
});

describe('clampLimit', () => {
  it('falls back to the default for absent or unparseable input', () => {
    expect(clampLimit(null)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampLimit(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampLimit('abc')).toBe(DEFAULT_PAGE_SIZE);
    expect(clampLimit('')).toBe(DEFAULT_PAGE_SIZE);
  });

  it('caps at MAX_PAGE_SIZE so a caller cannot request the whole table', () => {
    expect(clampLimit(10_000)).toBe(MAX_PAGE_SIZE);
    expect(clampLimit('999')).toBe(MAX_PAGE_SIZE);
  });

  it('rejects zero and negatives', () => {
    expect(clampLimit(0)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampLimit(-5)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('accepts a valid limit unchanged', () => {
    expect(clampLimit(12)).toBe(12);
    expect(clampLimit('30')).toBe(30);
  });

  it('truncates a fractional limit', () => {
    expect(clampLimit(12.9)).toBe(12);
  });
});

describe('keysetArgs', () => {
  it('over-fetches by one to detect whether another page exists', () => {
    expect(keysetArgs(null, 24)).toEqual({ take: 25 });
  });

  it('skips the cursor row itself so it is not returned twice', () => {
    // Without skip:1 the row the cursor points at would repeat as the first item
    // of the next page.
    expect(keysetArgs(VALID_ID, 10)).toEqual({
      take: 11,
      cursor: { id: VALID_ID },
      skip: 1,
    });
  });
});

describe('toPage', () => {
  /**
   * Ids must look like real cuids: `decodeCursor` deliberately rejects anything that
   * is not 20-40 alphanumeric characters, so a test using "id-1" would exercise the
   * rejection path instead of the pagination logic.
   */
  const idAt = (index: number) => `clxq${String(index).padStart(20, '0')}`;
  const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ id: idAt(i) }));

  it('reports no next cursor when the last page is short', () => {
    const page = toPage(rows(5), 10);
    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBeNull();
  });

  it('reports no next cursor when the page is exactly full', () => {
    // Exactly `limit` rows means the over-fetch found nothing extra.
    const page = toPage(rows(10), 10);
    expect(page.items).toHaveLength(10);
    expect(page.nextCursor).toBeNull();
  });

  it('trims the over-fetched row and returns a cursor when more exist', () => {
    const page = toPage(rows(11), 10);
    expect(page.items).toHaveLength(10);
    expect(page.items.at(-1)?.id).toBe(idAt(9));
    // The cursor points at the last *returned* row, not the peeked one — otherwise
    // the next page would skip a record.
    expect(decodeCursor(page.nextCursor)).toBe(idAt(9));
  });

  it('handles an empty result set', () => {
    expect(toPage([], 10)).toEqual({ items: [], nextCursor: null });
  });

  it('never repeats an item across consecutive pages', () => {
    // Simulates the real invariant: paging through 25 rows in pages of 10 must
    // yield each row exactly once.
    const all = rows(25);
    const seen: string[] = [];
    let cursor: string | null = null;

    for (let guard = 0; guard < 10; guard++) {
      const decoded = decodeCursor(cursor);
      const startIndex = decoded ? all.findIndex((row) => row.id === decoded) + 1 : 0;
      const slice = all.slice(startIndex, startIndex + 11);
      const page = toPage(slice, 10);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }

    expect(seen).toEqual(all.map((row) => row.id));
    expect(new Set(seen).size).toBe(25);
  });
});
