'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { addRecentSearch, clearRecentSearches, readRecentSearches } from '@/lib/search/recent';
import type { Suggestion } from '@/lib/search/suggest';

/**
 * Header search with typeahead suggestions and recent searches.
 *
 * Accessibility: this is a combobox, and it is built as one — `role="combobox"` with
 * `aria-expanded`, `aria-controls` and `aria-activedescendant`, and a `role="listbox"` of options.
 * That is what makes arrow keys and screen-reader announcement work. A plain input with a div of
 * clickable results looks identical and is unusable without a mouse.
 *
 * The form still submits normally, so search works with JavaScript disabled or before hydration:
 * the input has a name and the form has an action. The suggestions are the enhancement.
 */

const DEBOUNCE_MS = 180;
const MIN_QUERY_LENGTH = 2;

export function SearchBox({ initialQuery = '' }: { initialQuery?: string }) {
  const router = useRouter();
  const listboxId = useId();

  const [query, setQuery] = useState(initialQuery);
  /** What the query key follows. Lags `query` by DEBOUNCE_MS so a keystroke is not a request. */
  const [debounced, setDebounced] = useState(initialQuery.trim());
  const [recent, setRecent] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /*
   * Recent searches are read when the dropdown is about to open, not in a mount effect.
   *
   * localStorage does not exist during server render, so a lazy `useState` initialiser would
   * produce a hydration mismatch — and reading it in an effect means a synchronous setState that
   * triggers a cascading render for data nobody has asked to see yet. Opening the list is an event,
   * so that is where the read belongs.
   */
  const openWithRecent = useCallback(() => {
    setRecent(readRecentSearches());
    setIsOpen(true);
  }, []);

  // Debounce only. The request itself, its cancellation and its caching are the query's job.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  /*
   * Keyed by the debounced text, which is what makes typeahead cheap: typing "headphones" leaves
   * every prefix cached, so backspacing shows earlier results instantly and issues no request at
   * all. The old version refetched every prefix on the way back.
   *
   * A long staleTime is right here — the suggestion set is derived from a fixed catalog and does
   * not move while someone is typing.
   */
  const { data } = useQuery({
    queryKey: ['search-suggest', debounced],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(debounced)}`, {
        signal,
        headers: { accept: 'application/json' },
      });
      // Offline or a failed request: no suggestions, but the form still submits.
      if (!response.ok) return { suggestions: [] as Suggestion[] };
      return (await response.json()) as { suggestions?: Suggestion[] };
    },
    enabled: debounced.length >= MIN_QUERY_LENGTH,
    staleTime: 5 * 60_000,
  });

  const suggestions = data?.suggestions ?? [];

  // Close when focus or a click leaves the whole control.
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current !== null && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const isQueryLongEnough = query.trim().length >= MIN_QUERY_LENGTH;
  const showRecent = !isQueryLongEnough && recent.length > 0;

  /*
   * Derived during render rather than cleared by an effect. The fetched suggestions may still be
   * for a longer previous query when the box is cleared; gating on the current query length here
   * means a stale list can never be shown, with no extra render to clear it.
   */
  const visibleSuggestions = isQueryLongEnough ? suggestions : [];

  const options: Array<{ label: string; href: string; kind: string }> = showRecent
    ? recent.map((entry) => ({
        label: entry,
        href: `/search?q=${encodeURIComponent(entry)}`,
        kind: 'recent',
      }))
    : visibleSuggestions.map((suggestion) => ({ ...suggestion }));

  const submit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed === '') return;

      addRecentSearch(trimmed);
      setRecent(readRecentSearches());
      setIsOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    },
    [router],
  );

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (!isOpen || options.length === 0) {
      // Arrow down with a closed list opens it, which is what a combobox is expected to do.
      if (event.key === 'ArrowDown' && options.length > 0) {
        setIsOpen(true);
        setActiveIndex(0);
        event.preventDefault();
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? options.length - 1 : index - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      // Enter on a highlighted option follows it; Enter with nothing highlighted submits the
      // raw query, which is the behaviour people expect from a search box.
      event.preventDefault();
      const option = options[activeIndex];
      if (option !== undefined) {
        if (option.kind === 'recent') submit(option.label);
        else {
          setIsOpen(false);
          router.push(option.href);
        }
      }
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <form
        // Works before hydration and with JS disabled.
        action="/search"
        method="get"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submit(query);
        }}
        className="flex"
      >
        <label htmlFor="site-search" className="sr-only">
          Search products
        </label>
        <input
          ref={inputRef}
          id="site-search"
          name="q"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={openWithRecent}
          onKeyDown={handleKeyDown}
          placeholder="Search products"
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen && options.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          // Names the highlighted option so a screen reader announces it as focus moves.
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          className="min-h-11 w-full rounded-l-md border-0 bg-surface px-3 text-fg"
        />
        <button
          type="submit"
          aria-label="Search"
          className="inline-flex min-h-11 w-11 items-center justify-center rounded-r-md bg-accent text-accent-fg"
        >
          <SearchIcon />
        </button>
      </form>

      {isOpen && options.length > 0 && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-surface shadow-lg">
          {showRecent && (
            <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
              <span className="text-xs font-medium text-fg-muted">Recent searches</span>
              <button
                type="button"
                onClick={() => {
                  clearRecentSearches();
                  setRecent([]);
                }}
                className="text-xs text-info underline"
              >
                Clear
              </button>
            </div>
          )}

          <ul id={listboxId} role="listbox" aria-label="Search suggestions">
            {options.map((option, index) => (
              <li
                key={`${option.kind}-${option.label}`}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
              >
                <button
                  type="button"
                  // mousedown, not click: the input's blur would otherwise close the list first.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (option.kind === 'recent') submit(option.label);
                    else {
                      setIsOpen(false);
                      router.push(option.href);
                    }
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-fg',
                    index === activeIndex && 'bg-surface-sunken',
                  )}
                >
                  <span aria-hidden="true" className="shrink-0 text-fg-subtle">
                    {option.kind === 'recent' ? <ClockIcon /> : <SearchIcon />}
                  </span>
                  <span className="truncate">{option.label}</span>
                  {option.kind === 'category' && (
                    <span className="ml-auto shrink-0 text-xs text-fg-subtle">in Categories</span>
                  )}
                  {option.kind === 'brand' && (
                    <span className="ml-auto shrink-0 text-xs text-fg-subtle">Brand</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
