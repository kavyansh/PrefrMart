/**
 * Opaque cursor helpers for keyset pagination.
 *
 * The cursor is a base64url-encoded record id. Encoding it keeps the wire format
 * opaque, so we can later switch to a composite cursor without breaking clients
 * that have a stale URL or a cached page.
 *
 * Correctness note: every paginated query MUST sort by its sort field *and* `id`.
 * Without the `id` tiebreaker, rows sharing a sort value (two products at the same
 * price, two same-second reviews) have no stable order, and pages can silently
 * duplicate or skip them.
 */

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 60;

export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};

export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

/** Returns null for absent or malformed input rather than throwing — a bad cursor just means page one. */
export function decodeCursor(cursor: string | null | undefined): string | null {
  if (!cursor) return null;

  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    // cuid()s are alphanumeric; reject anything else so a hostile cursor cannot
    // reach the query layer as an arbitrary string.
    if (!/^[a-z0-9]{20,40}$/i.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function clampLimit(raw: string | number | null | undefined): number {
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.trunc(parsed), MAX_PAGE_SIZE);
}

/**
 * Build the `take`/`cursor`/`skip` arguments for a keyset query.
 * We over-fetch by one row purely to learn whether another page exists.
 */
export function keysetArgs(cursor: string | null, limit: number) {
  return {
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

/**
 * Split an over-fetched result set into the page and the next cursor.
 * Pass the rows returned by a query built with `keysetArgs`.
 */
export function toPage<T extends { id: string }>(rows: T[], limit: number): Page<T> {
  if (rows.length <= limit) {
    return { items: rows, nextCursor: null };
  }

  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: last ? encodeCursor(last.id) : null,
  };
}
