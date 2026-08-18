import { db } from '@/lib/db';
import { clampLimit, decodeCursor, keysetArgs, toPage, type Page } from '@/lib/pagination';
import type { Prisma } from '@/generated/prisma/client';

/**
 * Order history reads.
 *
 * Every function here takes a `userId` and scopes the query by it. That is not a convenience —
 * it is the authorisation boundary. An order is only ever fetched as "this user's order with
 * this id", so a guessed or enumerated id returns null rather than someone else's purchase.
 * There is deliberately no `getOrderById(id)` for a caller to reach for by mistake.
 */

export type OrderSummary = {
  id: string;
  number: string;
  status: string;
  placedAt: string;
  etaAt: string;
  totalCents: number;
  currency: string;
  itemCount: number;
  /** Thumbnails for the first few items, for the history list. */
  previewImages: string[];
  firstItemTitle: string;
};

const SUMMARY_SELECT = {
  id: true,
  number: true,
  status: true,
  placedAt: true,
  etaAt: true,
  totalCents: true,
  currency: true,
  items: { select: { titleSnapshot: true, imageSnapshot: true, qty: true } },
} satisfies Prisma.OrderSelect;

type SummaryRow = Prisma.OrderGetPayload<{ select: typeof SUMMARY_SELECT }>;

function toSummary(row: SummaryRow): OrderSummary {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    placedAt: row.placedAt.toISOString(),
    etaAt: row.etaAt.toISOString(),
    totalCents: row.totalCents,
    currency: row.currency,
    // Total units, not line count: "3 items" should mean three things arriving.
    itemCount: row.items.reduce((sum, item) => sum + item.qty, 0),
    previewImages: row.items.slice(0, 3).map((item) => item.imageSnapshot).filter(Boolean),
    firstItemTitle: row.items[0]?.titleSnapshot ?? 'Order',
  };
}

export async function listOrders({
  userId,
  cursor,
  limit,
}: {
  userId: string;
  cursor?: string | null;
  limit?: number;
}): Promise<Page<OrderSummary>> {
  const pageSize = clampLimit(limit);
  const decoded = decodeCursor(cursor);

  const fetch = (from: string | null) =>
    db.order.findMany({
      where: { userId },
      // `id` tiebreaker for the same reason as every other paginated sort.
      orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      select: SUMMARY_SELECT,
      ...keysetArgs(from, pageSize),
    });

  let rows: SummaryRow[];
  try {
    rows = await fetch(decoded);
  } catch (error) {
    if (decoded === null) throw error;
    rows = await fetch(null);
  }

  const page = toPage(rows, pageSize);
  return { items: page.items.map(toSummary), nextCursor: page.nextCursor };
}

export type OrderDetail = {
  id: string;
  number: string;
  status: string;
  placedAt: string;
  etaAt: string;
  deliveryOption: string;
  paymentLabel: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  shipTo: {
    name: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    phone: string;
  };
  items: Array<{
    id: string;
    title: string;
    slug: string;
    image: string;
    unitCents: number;
    qty: number;
    lineCents: number;
  }>;
};

/** Scoped by userId: another user's order id resolves to null, not a 403 with a hint. */
export async function getOrder({
  userId,
  orderId,
}: {
  userId: string;
  orderId: string;
}): Promise<OrderDetail | null> {
  const row = await db.order.findFirst({
    where: { id: orderId, userId },
    select: {
      id: true,
      number: true,
      status: true,
      placedAt: true,
      etaAt: true,
      deliveryOption: true,
      paymentLabel: true,
      subtotalCents: true,
      shippingCents: true,
      taxCents: true,
      totalCents: true,
      currency: true,
      shipToName: true,
      shipToLine1: true,
      shipToLine2: true,
      shipToCity: true,
      shipToState: true,
      shipToPostal: true,
      shipToCountry: true,
      shipToPhone: true,
      items: {
        select: {
          id: true,
          titleSnapshot: true,
          slugSnapshot: true,
          imageSnapshot: true,
          unitCents: true,
          qty: true,
        },
      },
    },
  });

  if (row === null) return null;

  return {
    id: row.id,
    number: row.number,
    status: row.status,
    placedAt: row.placedAt.toISOString(),
    etaAt: row.etaAt.toISOString(),
    deliveryOption: row.deliveryOption,
    paymentLabel: row.paymentLabel,
    subtotalCents: row.subtotalCents,
    shippingCents: row.shippingCents,
    taxCents: row.taxCents,
    totalCents: row.totalCents,
    currency: row.currency,
    shipTo: {
      name: row.shipToName,
      line1: row.shipToLine1,
      line2: row.shipToLine2,
      city: row.shipToCity,
      state: row.shipToState,
      postalCode: row.shipToPostal,
      country: row.shipToCountry,
      phone: row.shipToPhone,
    },
    items: row.items.map((item) => ({
      id: item.id,
      title: item.titleSnapshot,
      slug: item.slugSnapshot,
      image: item.imageSnapshot,
      unitCents: item.unitCents,
      qty: item.qty,
      // Computed from the snapshotted unit price, so history stays truthful if the
      // product's price later changes.
      lineCents: item.unitCents * item.qty,
    })),
  };
}

export async function countOrders(userId: string): Promise<number> {
  return db.order.count({ where: { userId } });
}
