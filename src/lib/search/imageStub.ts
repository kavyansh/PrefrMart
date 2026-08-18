import { db } from '@/lib/db';
import { createRng } from '@/lib/rng';

/**
 * Image search — a STUB. This performs no image analysis whatsoever.
 *
 * Say that plainly, because the surrounding machinery is real and could easily be mistaken for
 * more than it is: the upload works, the file is validated (size, MIME, magic bytes), the request
 * round-trips, and the results render like any other product list. What it does *not* do is look at
 * the picture.
 *
 * What it actually does: derives a seed from the file's own bytes (length plus a checksum), then
 * uses that seed to pick a stable, arbitrary set of products. So the same image always returns the
 * same results — which makes the feature demonstrable and testable — while a different image
 * returns different ones. That is the entire trick.
 *
 * Replacing this with real search means changing one function: produce an embedding for the
 * uploaded bytes, compare it against embeddings stored per product, and return the nearest. The
 * route handler, validation, UI and result rendering all stay as they are.
 *
 * The UI labels these results as a demo stub. That label is not decoration — without it the
 * feature is a lie, because the results genuinely have nothing to do with the image.
 */

export type ImageSearchResult = {
  productIds: string[];
  /** Surfaced to the UI so the label cannot be forgotten downstream. */
  isStub: true;
};

const RESULT_COUNT = 12;

/**
 * A cheap, stable digest of the uploaded bytes.
 *
 * Not a cryptographic hash and not trying to be — it only needs to map "the same file" to "the same
 * number" so results are reproducible across uploads of one image.
 */
function seedFromBytes(bytes: Uint8Array): number {
  let hash = 2166136261 >>> 0;

  // Sample rather than walk every byte: a 4MB upload does not need 4M iterations to produce a
  // stable seed, and this runs per request.
  const step = Math.max(1, Math.floor(bytes.length / 4096));
  for (let i = 0; i < bytes.length; i += step) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  // Mix the length in so two files with similar sampled bytes still diverge.
  hash ^= bytes.length;
  return hash >>> 0;
}

export async function findVisuallySimilar(bytes: Uint8Array): Promise<ImageSearchResult> {
  const rng = createRng(seedFromBytes(bytes));

  /*
   * Only in-stock products, and only ids. Returning something unbuyable from a search a shopper
   * initiated by photographing a thing they want is a poor result even from a stub.
   */
  const candidates = await db.product.findMany({
    where: { stock: { gt: 0 } },
    select: { id: true },
    // Bounded so the pick does not load the whole catalog into memory.
    take: 300,
    orderBy: { id: 'asc' },
  });

  return {
    productIds: rng.sample(candidates, RESULT_COUNT).map((row) => row.id),
    isStub: true,
  };
}
