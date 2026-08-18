import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ProfileForm } from '@/components/account/ProfileForm';
import { getSessionUserId } from '@/lib/auth/session';
import { loginUrlFor } from '@/lib/auth/redirect';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const userId = await getSessionUserId();
  if (userId === null) redirect(loginUrlFor('/account/profile'));

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, createdAt: true },
  });
  if (user === null) redirect(loginUrlFor('/account/profile'));

  return (
    <ProfileForm
      initialName={user.name}
      email={user.email}
      memberSince={user.createdAt.toISOString()}
    />
  );
}
