import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/AuthForm';
import { sanitizeRedirect } from '@/lib/auth/redirect';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  // Sanitised before it reaches the client, so the form cannot be handed a hostile target.
  const target = sanitizeRedirect(Array.isArray(next) ? next[0] : next);

  return (
    <main id="main" className="mx-auto max-w-sm px-4 py-10">
      <Link href="/" className="mb-8 block text-center text-xl font-semibold">
        Tender
      </Link>

      <h1 className="mb-1 text-xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-fg-muted">Welcome back.</p>

      <AuthForm mode="login" next={target} />

      {/*
        Demo credentials shown in the UI on purpose: this is a self-contained demo with seeded
        accounts, and hiding them in the README makes it harder to try. It would obviously not
        ship in a real storefront.
      */}
      <div className="mt-8 rounded-md border border-border bg-surface-sunken p-3 text-sm">
        <p className="mb-1 font-medium">Demo account</p>
        <p className="text-fg-muted">
          <code>asha@example.com</code> / <code>demo1234</code>
        </p>
      </div>
    </main>
  );
}
