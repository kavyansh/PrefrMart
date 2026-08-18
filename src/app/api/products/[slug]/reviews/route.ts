import type { NextRequest } from 'next/server';
import { apiError, guarded, ok, validationError } from '@/lib/api/response';
import { isSameOrigin } from '@/lib/api/request';
import { getSessionUserId } from '@/lib/auth/session';
import { createReview, listReviews } from '@/lib/catalog/reviews';
import { db } from '@/lib/db';
import { callerKey, rateLimit } from '@/lib/rateLimit';
import {
  createReviewSchema,
  reviewListQuerySchema,
  searchParamsToObject,
} from '@/lib/validation/schemas';

/**
 * GET  /api/products/[slug]/reviews — cursor-paginated, sortable
 * POST /api/products/[slug]/reviews — submit a review (auth required, one per product)
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A handful of reviews per hour is generous for a real reviewer, hostile for a spammer. */
const REVIEW_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  return guarded('reviews.list', async () => {
    const { slug } = await params;

    const parsed = reviewListQuerySchema.safeParse(
      searchParamsToObject(request.nextUrl.searchParams),
    );
    if (!parsed.success) return validationError(parsed.error);

    const product = await db.product.findUnique({ where: { slug }, select: { id: true } });
    if (product === null) return apiError('not_found', 'That product does not exist.');

    // Used only to mark the caller's own review in the response; absence is fine.
    const currentUserId = await getSessionUserId();

    const page = await listReviews({
      productId: product.id,
      cursor: parsed.data.cursor,
      limit: parsed.data.limit,
      sort: parsed.data.sort,
      currentUserId,
    });

    return ok(page, {
      // Per-user field (`isOwn`), so this must never be cached by a shared cache.
      headers: { 'cache-control': 'private, no-store' },
    });
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  return guarded('reviews.create', async () => {
    if (!isSameOrigin(request)) {
      return apiError('forbidden', 'Cross-origin requests are not allowed.');
    }

    const userId = await getSessionUserId();
    if (userId === null) {
      return apiError('unauthorized', 'Sign in to write a review.');
    }

    // Keyed by user, not IP: the limit is about one account's behaviour, and a signed-in
    // identity is far harder to rotate than an address.
    const limited = rateLimit({
      key: callerKey(request, `review:${userId}`),
      ...REVIEW_RATE_LIMIT,
    });
    if (!limited.allowed) {
      return apiError('rate_limited', 'You have submitted several reviews recently.');
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return apiError('bad_request', 'Expected a JSON body.');
    }

    const parsed = createReviewSchema.safeParse(payload);
    if (!parsed.success) return validationError(parsed.error);

    const { slug } = await params;
    const result = await createReview({
      productSlug: slug,
      userId,
      rating: parsed.data.rating,
      title: parsed.data.title,
      body: parsed.data.body,
    });

    if (!result.ok) {
      if (result.reason === 'product_not_found') {
        return apiError('not_found', 'That product does not exist.');
      }
      return apiError('conflict', 'You have already reviewed this product.');
    }

    return ok(
      {
        review: result.review,
        ratingAvg: result.ratingAvg,
        ratingCount: result.ratingCount,
      },
      { status: 201 },
    );
  });
}
