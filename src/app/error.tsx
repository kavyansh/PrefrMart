'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * Route-level error boundary.
 *
 * Deliberately shows no error detail. A thrown message can carry table names, query
 * fragments or file paths, and this component renders in the user's browser — the digest
 * is enough to correlate with the server log.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('[route-error]', error);
  }, [error]);

  return (
    <main id="main" className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-2 text-xl font-semibold">Something went wrong</h1>
      <p className="mb-6 text-sm text-fg-muted">
        We could not load this page. This is usually temporary.
      </p>

      <div className="flex justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="secondary" onClick={() => router.push('/')}>
          Go to home
        </Button>
      </div>

      {error.digest !== undefined && (
        <p className="mt-6 text-xs text-fg-subtle">Reference: {error.digest}</p>
      )}
    </main>
  );
}
