'use client';

/**
 * Recent searches, in localStorage.
 *
 * localStorage rather than IndexedDB here, unlike the cart: this is a handful of short strings read
 * synchronously when a dropdown opens, so the async ceremony would buy nothing. The cart needs
 * IndexedDB because a service worker has to reach it.
 *
 * Every operation degrades to a no-op. Storage is unavailable in some private-browsing modes, and a
 * shopper there should lose their search history, not the search box.
 */

const STORAGE_KEY = 'tender:recent-searches';
const MAX_RECENT = 6;

export function readRecentSearches(): string[] {
  if (typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function addRecentSearch(query: string): void {
  const trimmed = query.trim();
  if (trimmed === '' || typeof localStorage === 'undefined') return;

  try {
    // Case-insensitive de-duplication, and the new entry moves to the front — "shoes" searched
    // again should not sit below three later searches.
    const existing = readRecentSearches().filter(
      (entry) => entry.toLowerCase() !== trimmed.toLowerCase(),
    );
    const next = [trimmed, ...existing].slice(0, MAX_RECENT);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota or disabled storage. Not worth surfacing.
  }
}

export function clearRecentSearches(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // As above.
  }
}
