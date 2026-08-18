/* eslint-disable react/no-danger -- See the justification below. This is the ONLY file in the
   project permitted to use dangerouslySetInnerHTML, and the exemption is deliberately scoped
   to it so the ban holds everywhere else. */

import { headers } from 'next/headers';

/**
 * Renders schema.org structured data as a JSON-LD script block.
 *
 * Why this needs `dangerouslySetInnerHTML` at all: `<script type="application/ld+json">` must
 * contain raw JSON, and React HTML-escapes text children — which would turn every `"` in the
 * payload into `&quot;` and produce invalid JSON, since HTML entities are not decoded inside a
 * script element. There is no other way to emit it.
 *
 * Why it is safe here, unlike every other use of that API:
 *
 *  - The input is a plain object serialised by `JSON.stringify`, never a string assembled from
 *    fragments. There is no path for markup to survive serialisation as markup.
 *  - `<` is escaped to `<`. That closes the one real injection vector: a `</script>`
 *    inside a string value would otherwise terminate the element early and let the remainder
 *    be parsed as HTML.
 *  - `type="application/ld+json"` is a data block. Browsers do not execute unrecognised script
 *    types, so there is nothing here for `script-src` to run.
 *
 * The nonce is attached anyway. Not because the block needs it to work — it does not — but so
 * that `tests/security.test.ts` can assert, with no exemptions, that *every* script element in
 * every page carries the request nonce. An exemption in that test is a place for a genuinely
 * unnonced script to hide later.
 *
 * Callers pass an object, not a string, so they cannot bypass the escaping.
 */
export async function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
