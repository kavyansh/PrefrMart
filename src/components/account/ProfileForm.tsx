'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * Profile editing. Only the name is editable.
 *
 * Email and password are shown read-only rather than as disabled inputs: a disabled field
 * invites the user to try, then silently refuses. Changing an email needs a verification step
 * so nobody can claim an address they do not control, and a password change needs the current
 * password — neither is in scope, so neither pretends to be available.
 */
export function ProfileForm({
  initialName,
  email,
  memberSince,
}: {
  initialName: string;
  email: string;
  memberSince: string;
}) {
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const isDirty = name.trim() !== initialName;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (name.trim() === '') {
      setError('Enter your name.');
      return;
    }

    setStatus('saving');
    setError(null);
    try {
      const response = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (response.ok) {
        setStatus('saved');
        // The name appears in the settings sidebar too, which is server-rendered — refresh
        // so both update together rather than disagreeing until the next navigation.
        router.refresh();
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string; fields?: Record<string, string> } }
        | null;
      setError(payload?.error?.fields?.name ?? payload?.error?.message ?? 'Could not save.');
      setStatus('idle');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setStatus('idle');
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-4 text-base font-semibold">Profile</h2>

      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-4">
          <label htmlFor="profile-name" className="mb-1.5 block text-sm font-medium">
            Name
          </label>
          <input
            id="profile-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              // Clear the confirmation as soon as the value diverges from what was saved.
              if (status === 'saved') setStatus('idle');
            }}
            autoComplete="name"
            aria-invalid={error !== null}
            aria-describedby={error !== null ? 'profile-name-error' : undefined}
            className="min-h-11 w-full max-w-sm rounded-md border border-border bg-surface px-3"
          />
          {error !== null && (
            <p id="profile-name-error" className="mt-1 text-sm text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="mb-4">
          <p className="mb-1.5 text-sm font-medium">Email</p>
          <p className="text-sm text-fg-muted">{email}</p>
          <p className="mt-1 text-xs text-fg-subtle">
            Changing your email is not available in this demo.
          </p>
        </div>

        <div className="mb-6">
          <p className="mb-1.5 text-sm font-medium">Member since</p>
          <p className="text-sm text-fg-muted">
            <time dateTime={memberSince}>
              {new Date(memberSince).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </time>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!isDirty || status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save changes'}
          </Button>

          {/* role="status" announces the confirmation without stealing focus. */}
          <span role="status" className="text-sm text-success">
            {status === 'saved' ? 'Saved' : ''}
          </span>
        </div>
      </form>
    </div>
  );
}
