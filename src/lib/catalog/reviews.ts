import { db } from '@/lib/db';
import { clampLimit, decodeCursor, keysetArgs, toPage, type Page } from '@/lib/pagination';
import type { ReviewSort } from '@/lib/catalog/sorts';
import type { Prisma } from '@/generated/prisma/client';

/**
 * Reviews: reading, writing, and keeping the denormalised rating aggregates honest.
 */

export type ReviewItem = {
  id: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
  authorName: string;
  /** True for the signed-in user's own review, so the UI can label it. */
  isOwn: boolean;
};

/** Star counts, 1-5, for the distribution bars. */
export type RatingDistribution = Record<1 | 2 | 3 | 4 | 5, number>;

const REVIEW_SELECT = {
  id: true,
  rating: true,
  title: true,
  body: true,
  createdAt: true,
  userId: true,
  user: { select: { name: true } },
} satisfies Prisma.ReviewSelect;

type ReviewRow = Prisma.ReviewGetPayload<{ select: typeof REVIEW_SELECT }>;

function toReviewItem(row: ReviewRow, currentUserId: string | null): ReviewItem {
  return {
    id: row.id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    // Serialised for the client boundary; Date does not survive it usefully.
    createdAt: row.createdAt.toISOString(),
    authorName: row.user.name,
    isOwn: currentUserId !== null && row.userId === currentUserId,
  };
}

/** Every sort ends in `id` — see the note on ORDER_BY in products.ts. */
const REVIEW_ORDER_BY: Record<ReviewSort, Prisma.ReviewOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }, { id: 'desc' }],
  highest: [{ rating: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  lowest: [{ rating: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
};

export async function listReviews({
  productId,
  cursor,
  limit,
  sort = 'newest',
  currentUserId = null,
}: {
  productId: string;
  cursor?: string | null;
  limit?: number;
  sort?: ReviewSort;
  currentUserId?: string | null;
}): Promise<Page<ReviewItem>> {
  const pageSize = clampLimit(limit);
  const decoded = decodeCursor(cursor);

  const fetch = (from: string | null) =>
    db.review.findMany({
      where: { productId },
      orderBy: REVIEW_ORDER_BY[sort],
      select: REVIEW_SELECT,
      ...keysetArgs(from, pageSize),
    });

  let rows: ReviewRow[];
  try {
    rows = await fetch(decoded);
  } catch (error) {
    // A cursor can outlive the review it points at (deleted review, reseeded database).
    if (decoded === null) throw error;
    rows = await fetch(null);
  }

  const page = toPage(rows, pageSize);
  return {
    items: page.items.map((row) => toReviewItem(row, currentUserId)),
    nextCursor: page.nextCursor,
  };
}

/**
 * Star histogram for a product.
 *
 * One grouped query rather than five counts. Absent ratings are filled with zero so the UI
 * can render all five bars without checking for undefined.
 */
export async function getRatingDistribution(productId: string): Promise<RatingDistribution> {
  const groups = await db.review.groupBy({
    by: ['rating'],
    where: { productId },
    _count: { _all: true },
  });

  const distribution: RatingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const group of groups) {
    const star = group.rating;
    if (star >= 1 && star <= 5) {
      distribution[star as 1 | 2 | 3 | 4 | 5] = group._count._all;
    }
  }
  return distribution;
}

export type CreateReviewResult =
  | { ok: true; review: ReviewItem; ratingAvg: number; ratingCount: number }
  | { ok: false; reason: 'product_not_found' | 'already_reviewed' };

/**
 * Write a review and recompute the product's aggregates in one transaction.
 *
 * The transaction is the point. `ratingAvg`/`ratingCount` are denormalised so listing pages
 * need no per-card aggregate query, which means they are only trustworthy if they can never
 * be observed disagreeing with the review rows. Writing the review and recomputing the
 * aggregate as two separate statements would leave a window where a product shows 12 reviews
 * and an average computed from 11.
 *
 * Recomputing from an aggregate query rather than nudging a running average also means a
 * transient failure cannot leave the figure permanently skewed — it is derived, not
 * accumulated.
 */
export async function createReview({
  productSlug,
  userId,
  rating,
  title,
  body,
}: {
  productSlug: string;
  userId: string;
  rating: number;
  title: string;
  body: string;
}): Promise<CreateReviewResult> {
  const product = await db.product.findUnique({
    where: { slug: productSlug },
    select: { id: true },
  });
  if (product === null) return { ok: false, reason: 'product_not_found' };

  const existing = await db.review.findUnique({
    where: { productId_userId: { productId: product.id, userId } },
    select: { id: true },
  });
  if (existing !== null) return { ok: false, reason: 'already_reviewed' };

  try {
    return await db.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: { productId: product.id, userId, rating, title, body },
        select: REVIEW_SELECT,
      });

      const aggregate = await tx.review.aggregate({
        where: { productId: product.id },
        _avg: { rating: true },
        _count: { _all: true },
      });

      // One decimal is all the UI ever displays; storing more invites avg values that
      // render differently in different places.
      const ratingAvg = Math.round((aggregate._avg.rating ?? 0) * 10) / 10;
      const ratingCount = aggregate._count._all;

      await tx.product.update({
        where: { id: product.id },
        data: { ratingAvg, ratingCount },
      });

      return {
        ok: true as const,
        review: toReviewItem(created, userId),
        ratingAvg,
        ratingCount,
      };
    });
  } catch (error) {
    /*
     * The pre-check above is racy by nature: two simultaneous submissions can both pass it.
     * The @@unique([productId, userId]) constraint is the real guarantee, and this catch
     * turns that violation into the same clean "already reviewed" answer rather than a 500.
     */
    if (isUniqueViolation(error)) return { ok: false, reason: 'already_reviewed' };
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
