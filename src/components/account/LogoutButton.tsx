'use client';

import { signOut } from 'next-auth/react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * Sign out.
 *
 * A POST, not a link: a GET sign-out endpoint can be triggered by any third-party page
 * embedding `<img src="…">`, signing users out uninvited. NextAuth's `signOut()` posts to its
 * own endpoint and carries the CSRF token with it, which is why this must be a client
 * component — a plain anchor would be the wrong method.
 */
export function LogoutButton({ variant = 'secondary' }: { variant?: 'secondary' | 'ghost' }) {
  const [isPending, setIsPending] = useState(false);

  async function handleLogout() {
    setIsPending(true);
    try {
      // A full navigation rather than a client-side replace: it discards the router cache,
      // which otherwise still holds the signed-in render of the pages we land on.
      await signOut({ redirectTo: '/' });
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
