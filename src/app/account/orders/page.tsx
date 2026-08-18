import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { OrderHistoryList } from '@/components/account/OrderHistoryList';
import { getSessionUserId } from '@/lib/auth/session';
import { loginUrlFor } from '@/lib/auth/redirect';
import { countOrders, listOrders } from '@/lib/orders/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Your orders' };

export default async function OrdersPage() {
  const userId = await getSessionUserId();
  if (userId === null) redirect(loginUrlFor('/account/orders'));

  const [page, totalCount] = await Promise.all([
    listOrders({ userId, limit: 10 }),
    countOrders(userId),
  ]);

  return (
    <section>
      <h2 className="mb-4 text-base font-semibold">
        Your orders
        {totalCount > 0 && (
          <span className="ml-2 font-normal text-fg-muted">({totalCount})</span>
        )}
      </h2>
      <OrderHistoryList initialPage={page} totalCount={totalCount} />
    </section>
  );
}
