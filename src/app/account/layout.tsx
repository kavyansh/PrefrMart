import { redirect } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { SettingsNav } from '@/components/account/SettingsNav';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { loginUrlFor } from '@/lib/auth/redirect';

/**
 * Settings shell: sidebar plus content.
 *
 * The proxy already redirects unauthenticated requests here, so in normal operation this
 * `redirect` never fires. It stays because the proxy verifies only the token signature — a
 * valid token for a since-deleted user gets past it, and `getCurrentUser()` is what notices.
 * Defence in depth: the layout does not assume the gate upstream held.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (user === null) redirect(loginUrlFor('/account/profile'));

  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-(--container-page) px-3 py-4 sm:px-4">
        <h1 className="mb-4 text-xl font-semibold sm:text-2xl">Settings</h1>
        <div className="lg:flex lg:gap-8">
          <SettingsNav userName={user.name} />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </main>
    </>
  );
}
