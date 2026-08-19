'use client';

import { isServer, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * The one QueryClient, and the reason it is not a module-level singleton.
 *
 * A client created at module scope is shared by every concurrent request on the server, so one
 * shopper's cached data can be read while rendering another's page. The client must therefore be
 * per-request on the server, and a singleton only in the browser — where a single user owns the
 * tab and the cache surviving client-side navigation is the whole point.
 *
 * That browser singleton is what replaces the sessionStorage snapshot the catalog used to keep:
 * opening a product and pressing back re-renders the listing from cache with every loaded page
 * intact. A full reload still starts over, which the sessionStorage version survived — an
 * accepted trade for deleting ~600 lines of hand-rolled persistence.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        /*
         * Matches the `s-maxage=60` the products API already sends, so the client and the CDN
         * agree on how long a page of results stays fresh.
         */
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        /*
         * Off deliberately. For an infinite list, a focus refetch re-requests every loaded page
         * at once and can reorder the grid under someone who just tabbed back to it.
         */
        refetchOnWindowFocus: false,
        retry: 2,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
