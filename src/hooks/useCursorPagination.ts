'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page } from '@/lib/pagination';

/**
 * Cursor-driven incremental loading with back-navigation restore.
 *
 * Design notes:
 *
 *  - The first page is rendered on the server and handed in as `initialPage`, so the
 *    catalog is visible before any JS runs. This hook only ever fetches pages 2+.
 *
 *  - `storageKey` scopes a sessionStorage snapshot of everything loaded so far. Without
 *    it, a user who scrolls through six pages, opens a product and presses back lands at
 *    the top with one page again — the most common flaw in infinite-scroll UIs. Next
 *    restores scroll position, but the *items* live in component state that is lost on
 *    unmount, so we persist them ourselves.
 *
 *  - Concurrent requests are collapsed via `loadingRef`. An IntersectionObserver fires
 *    repeatedly while the sentinel stays visible; without the guard that becomes a burst
 *    of identical requests and duplicated rows. The ref is only ever written from inside
 *    a callback, never during render.
 *
 *  - An in-flight request is aborted on unmount, so a late response cannot call setState
 *    on a torn-down component.
 */

/** Cap what we persist: sessionStorage has a hard quota and this is a nice-to-have. */
const MAX_PERSISTED_ITEMS = 200;

/** Begin fetching this far before the sentinel is actually visible. */
const PREFETCH_MARGIN = '600px 0px';

type Snapshot<T> = {
  items: T[];
  nextCursor: string | null;
};

export type CursorPaginationState<T> = {
  items: T[];
  /** True while a page request is in flight. */
  isLoading: boolean;
  /** Set when the last attempt failed; retrying clears it. */
  error: string | null;
  /** False once the server reports no further pages. */
  hasMore: boolean;
  /** Load the next page. Safe to call repeatedly; overlapping calls are ignored. */
  loadMore: () => void;
  /** Attach to a sentinel element below the list to drive automatic loading. */
  sentinelRef: (node: HTMLElement | null) => void;
  /** Total loaded so far, for the "showing N of M" affordance. */
  loadedCount: number;
};

function readSnapshot<T>(storageKey: string | undefined): Snapshot<T> | null {
  if (!storageKey || typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as Snapshot<T>).items)
    ) {
      return null;
    }
    return parsed as Snapshot<T>;
  } catch {
    // Corrupt or unavailable storage must never break the listing.
    return null;
  }
}

function writeSnapshot<T>(storageKey: string | undefined, snapshot: Snapshot<T>): void {
  if (!storageKey || typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        items: snapshot.items.slice(0, MAX_PERSISTED_ITEMS),
        nextCursor: snapshot.nextCursor,
      }),
    );
  } catch {
    // Over quota, or storage disabled in private browsing. Not worth surfacing.
  }
}

export function useCursorPagination<T extends { id: string }>({
  initialPage,
  fetchPage,
  storageKey,
}: {
  /** Server-rendered first page. */
  initialPage: Page<T>;
  /** Fetch one page for a cursor. Must reject on failure. */
  fetchPage: (cursor: string, signal: AbortSignal) => Promise<Page<T>>;
  /** sessionStorage key for back-navigation restore. Omit to disable persistence. */
  storageKey?: string;
}): CursorPaginationState<T> {
  /*
   * Initialise from a snapshot when one exists for this exact filter set, so returning to
   * the listing restores everything that was loaded. The lazy initialiser matters:
   * restoring in an effect instead would render one page and then visibly jump.
   */
  const [snapshot, setSnapshot] = useState<Snapshot<T>>(() => {
    const restored = readSnapshot<T>(storageKey);
    if (restored && restored.items.length >= initialPage.items.length) {
      return restored;
    }
    return { items: initialPage.items, nextCursor: initialPage.nextCursor };
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Written only from inside callbacks and effects. Guards against overlapping fetches
  // without waiting for a re-render, which state could not do.
  const loadingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Persist after every change, so navigating away at any moment is recoverable.
  useEffect(() => {
    writeSnapshot(storageKey, snapshot);
  }, [storageKey, snapshot]);

  const cursor = snapshot.nextCursor;

  const loadMore = useCallback(() => {
    if (loadingRef.current || cursor === null) return;

    loadingRef.current = true;
    setIsLoading(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    fetchPage(cursor, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;

        setSnapshot((previous) => {
          /*
           * Defensive de-duplication. Keyset pagination should never return a row twice,
           * but a row inserted or deleted between requests can shift the window — and a
           * duplicate React key is a hard error, not a cosmetic one.
           */
          const seen = new Set(previous.items.map((item) => item.id));
          const fresh = page.items.filter((item) => !seen.has(item.id));

          return { items: [...previous.items, ...fresh], nextCursor: page.nextCursor };
        });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        // Offline, a 500, or malformed JSON all land here. The message stays plain: the
        // UI offers a retry rather than explaining the cause.
        setError('Could not load more products.');
        console.error('[useCursorPagination]', cause);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        loadingRef.current = false;
        setIsLoading(false);
      });
  }, [cursor, fetchPage]);

  /*
   * The sentinel is held in state rather than a ref so the observer effect can depend on
   * it. Storing it in a ref and mutating during render would leave the observer holding a
   * stale `loadMore` closure — and is exactly what the react-hooks/refs rule forbids.
   */
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (sentinel === null || cursor === null) return;
    if (typeof IntersectionObserver === 'undefined') return;

    /*
     * rootMargin starts the fetch before the sentinel is visible, so the next rows are
     * usually already there when the user arrives — that is what makes the scroll feel
     * continuous instead of stalling at each page boundary.
     */
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { rootMargin: PREFETCH_MARGIN },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, cursor, loadMore]);

  return {
    items: snapshot.items,
    isLoading,
    error,
    hasMore: cursor !== null,
    loadMore,
    // A state setter is already stable, so this needs no memoisation.
    sentinelRef: setSentinel,
    loadedCount: snapshot.items.length,
  };
}
