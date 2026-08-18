'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * Sign out.
 *
 * A POST, not a link: a GET logout endpoint can be triggered by any third-party page embedding
 * `<img src="/api/auth/logout">`, signing users out uninvited. That is why this needs to be a
 * client component at all — a plain anchor would be the wrong method.
 */
export function LogoutButton({ variant = 'secondary' }: { variant?: 'secondary' | 'ghost' }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleLogout() {
    setIsPending(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      // refresh() first: without it the router cache still holds the signed-in render of
      // the pages we are navigating to.
      router.refresh();
      router.replace('/');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button variant={variant} onClick={handleLogout} disabled={isPending} fullWidth>
      {isPending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
