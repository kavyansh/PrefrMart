import type { NextRequest } from 'next/server';
import { apiError, guarded, ok } from '@/lib/api/response';
import { isSameOrigin } from '@/lib/api/request';
import { findVisuallySimilar } from '@/lib/search/imageStub';
import { checkUpload, MAX_UPLOAD_BYTES } from '@/lib/search/upload';
import { resolveProductsByIds } from '@/lib/catalog/products';
import { callerKey, rateLimit } from '@/lib/rateLimit';

/**
 * POST /api/search/image — "find visually similar products".
 *
 * The matching behind this is a STUB and performs no image analysis. See lib/search/imageStub.ts
 * for exactly what it does instead and why. The response carries `isStub: true` so the UI cannot
 * quietly present these as real matches.
 *
 * Everything around the stub is real: the upload is size-capped, MIME-checked and magic-byte
 * verified, the endpoint is rate-limited, and the bytes are never written to disk — they are read,
 * hashed and discarded.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Uploads are the most expensive thing an anonymous caller can ask of us.
const IMAGE_SEARCH_RATE_LIMIT = { limit: 20, windowMs: 10 * 60 * 1000 };

export async function POST(request: NextRequest) {
  return guarded('search.image', async () => {
    if (!isSameOrigin(request)) {
      return apiError('forbidden', 'Cross-origin requests are not allowed.');
    }

    const limited = rateLimit({
      key: callerKey(request, 'image-search'),
      ...IMAGE_SEARCH_RATE_LIMIT,
    });
    if (!limited.allowed) {
      return apiError('rate_limited', 'Too many image searches. Try again in a few minutes.');
    }

    /*
     * Check the declared length before reading the body. Not a real defence on its own — the header
     * is client-supplied — but it rejects the obvious case without buffering megabytes first.
     */
    const declaredLength = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES * 2) {
      return apiError('payload_too_large', 'Images must be under 4MB.');
    }

    let file: File | null = null;
    try {
      const form = await request.formData();
      const entry = form.get('image');
      if (entry instanceof File) file = entry;
    } catch {
      return apiError('bad_request', 'Expected a multipart form with an "image" field.');
    }

    if (file === null) {
      return apiError('bad_request', 'No image was uploaded.');
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    // The real gate: file signature, not the name or the declared type.
    const check = checkUpload({ bytes, declaredType: file.type || null });
    if (!check.ok) {
      return apiError('unsupported_media_type', check.reason);
    }

    const { productIds, isStub } = await findVisuallySimilar(bytes);
    const products = await resolveProductsByIds(productIds);

    return ok(
      {
        items: products,
        isStub,
        // Echoed back so the UI can show what was searched without keeping the file.
        detectedFormat: check.kind,
      },
      { headers: { 'cache-control': 'private, no-store' } },
    );
  });
}
