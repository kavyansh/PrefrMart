import Link from 'next/link';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/AuthForm';
import { sanitizeRedirect } from '@/lib/auth/redirect';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Create an account' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const target = sanitizeRedirect(Array.isArray(next) ? next[0] : next);

  return (
    <main id="main" className="mx-auto max-w-sm px-4 py-10">
      <Link href="/" className="mb-8 block text-center text-xl font-semibold">
        Tender
      </Link>

      <h1 className="mb-1 text-xl font-semibold">Create an account</h1>
      <p className="mb-6 text-sm text-fg-muted">
        You will be able to track orders and leave reviews.
      </p>

      <AuthForm mode="signup" next={target} />
    </main>
  );
}
