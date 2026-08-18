import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { OrderStatusBadge } from '@/components/account/OrderStatusBadge';
import { getSessionUserId } from '@/lib/auth/session';
import { loginUrlFor } from '@/lib/auth/redirect';
import { imageSrc } from '@/lib/catalog/taxonomy';
import { formatMoney } from '@/lib/money';
import { getOrder } from '@/lib/orders/queries';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
  /** `?placed=1` right after checkout, so the same page doubles as the confirmation. */
  searchParams: Promise<{ placed?: string }>;
};

export const metadata: Metadata = {
  title: 'Order details',
  // Order pages must never be indexed, even if a URL leaks.
  robots: { index: false, follow: false },
};

export default async function OrderDetailPage({ params, searchParams }: PageProps) {
  const [{ id }, { placed }] = await Promise.all([params, searchParams]);
  const justPlaced = placed === '1';

  const userId = await getSessionUserId();
  if (userId === null) redirect(loginUrlFor(`/orders/${id}`));

  /*
   * Scoped by userId, so another user's order id is indistinguishable from one that does not
   * exist. Returning 403 for "exists but not yours" would confirm the id is real, which is
   * enough to enumerate how many orders the site has.
   */
  const order = await getOrder({ userId, orderId: id });
  if (order === null) notFound();

  const dateFormat = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <Header />

      <main id="main" className="mx-auto max-w-3xl px-3 py-4 sm:px-4">
        {justPlaced ? (
          /*
            role="status" rather than an alert: this is confirmation, not a warning, and it should
            be announced without interrupting whatever the screen reader is doing.
          */
          <div
            role="status"
            className="mb-4 rounded-lg border border-success/30 bg-success-soft p-4"
          >
            <h2 className="text-base font-semibold text-success">Order placed</h2>
            <p className="mt-1 text-sm text-success">
              Thanks — we have your order and will email updates as it ships.
            </p>
          </div>
        ) : (
          <nav aria-label="Breadcrumb" className="mb-3 text-sm text-fg-muted">
            <Link href="/account/orders" className="hover:underline">
              ← Back to your orders
            </Link>
          </nav>
        )}

        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Order {order.number}</h1>
            <p className="mt-0.5 text-sm text-fg-muted">
              Placed{' '}
              <time dateTime={order.placedAt}>{dateFormat.format(new Date(order.placedAt))}</time>
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        <section className="mb-6 rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-3 text-base font-semibold">
            {order.items.length === 1 ? 'Item' : 'Items'}
          </h2>

          <ul className="space-y-4">
            {order.items.map((item) => (
              <li key={item.id} className="flex gap-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border">
                  {item.image !== '' && (
                    <Image src={imageSrc(item.image)} alt="" fill sizes="64px" className="object-cover" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  {/*
                    Links to the live product, but the text is the snapshotted title — the
                    name as it was when bought, which is what the customer recognises.
                  */}
                  <Link href={`/p/${item.slug}`} className="text-sm font-medium hover:underline">
                    {item.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {formatMoney(item.unitCents, order.currency)} × {item.qty}
                  </p>
                </div>

                <p className="text-sm font-medium">{formatMoney(item.lineCents, order.currency)}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-base font-semibold">Delivery</h2>
            {/* The snapshotted address, so history stays correct if the user later edits it. */}
            <address className="text-sm not-italic text-fg-muted">
              <span className="block font-medium text-fg">{order.shipTo.name}</span>
              {order.shipTo.line1}
              {order.shipTo.line2 !== null && (
                <>
                  <br />
                  {order.shipTo.line2}
                </>
              )}
              <br />
              {order.shipTo.city}, {order.shipTo.state} {order.shipTo.postalCode}
              <br />
              {order.shipTo.country}
              <br />
              {order.shipTo.phone}
            </address>

            <p className="mt-3 text-sm text-fg-muted">
              {order.deliveryOption === 'express' ? 'Express delivery' : 'Standard delivery'}
              {' · '}
              {order.status === 'delivered' ? 'Delivered' : 'Expected'}{' '}
              <time dateTime={order.etaAt}>{dateFormat.format(new Date(order.etaAt))}</time>
            </p>
          </section>

          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-base font-semibold">Payment</h2>
            <p className="mb-3 text-sm text-fg-muted">{order.paymentLabel}</p>

            <dl className="space-y-1.5 text-sm">
              <Row label="Subtotal" value={formatMoney(order.subtotalCents, order.currency)} />
              <Row
                label="Shipping"
                value={
                  order.shippingCents === 0
                    ? 'Free'
                    : formatMoney(order.shippingCents, order.currency)
                }
              />
              <Row label="Tax" value={formatMoney(order.taxCents, order.currency)} />
              <div className="border-t border-border pt-1.5">
                <Row
                  label="Total"
                  value={formatMoney(order.totalCents, order.currency)}
                  emphasis
                />
              </div>
            </dl>
          </section>
        </div>

        {justPlaced && (
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/account/orders"
              className="inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-4 text-sm font-medium"
            >
              View all orders
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-md border border-accent-strong bg-accent px-4 text-sm font-medium text-accent-fg"
            >
              Keep shopping
            </Link>
          </div>
        )}
      </main>
    </>
  );
}

function Row({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={emphasis ? 'font-semibold' : 'text-fg-muted'}>{label}</dt>
      <dd className={emphasis ? 'font-semibold' : ''}>{value}</dd>
    </div>
  );
}
