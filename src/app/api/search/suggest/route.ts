import type { NextRequest } from 'next/server';
import { guarded, ok, validationError } from '@/lib/api/response';
import { getSuggestions } from '@/lib/search/suggest';
import { searchQuerySchema, searchParamsToObject } from '@/lib/validation/schemas';

/** GET /api/search/suggest?q= — typeahead suggestions. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return guarded('search.suggest', async () => {
    const parsed = searchQuerySchema.safeParse(
      searchParamsToObject(request.nextUrl.searchParams),
    );
    if (!parsed.success) return validationError(parsed.error);

    const suggestions = await getSuggestions(parsed.data.q ?? '');

    return ok(
      { suggestions },
      {
        headers: {
          /*
           * Suggestions depend only on the query string and contain nothing personal, so a short
           * shared cache is safe and makes repeat prefixes instant as someone types.
           */
          'cache-control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      },
    );
  });
}
