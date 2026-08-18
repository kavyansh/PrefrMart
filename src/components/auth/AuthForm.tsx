'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/passwordPolicy';

/**
 * Shared sign-in / sign-up form.
 *
 * One component for both because they differ only by an extra field and an endpoint. Two
 * near-identical forms would drift — one gaining an accessibility fix or an error-mapping
 * improvement the other never gets.
 *
 * Field errors returned by the server are mapped straight onto the inputs, so a rejection
 * lands next to the thing that caused it rather than as a banner the user has to interpret.
 */

type Mode = 'login' | 'signup';

type FieldErrors = Partial<Record<'email' | 'password' | 'name', string>>;

export function AuthForm({ mode, next }: { mode: Mode; next: string }) {
  const router = useRouter();
  const isSignup = mode === 'signup';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (isSignup && name.trim() === '') errors.name = 'Enter your name.';
    if (!email.includes('@')) errors.email = 'Enter a valid email address.';
    if (password === '') {
      errors.password = 'Enter your password.';
    } else if (isSignup && password.length < MIN_PASSWORD_LENGTH) {
      // Only enforced on signup: applying it at login would reject a legitimate older
      // password and leak whether a stored one is short.
      errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    return errors;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors = validate();
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          isSignup
            ? { name: name.trim(), email: email.trim(), password }
            : { email: email.trim(), password },
        ),
      });

      if (response.ok) {
        /*
         * The session cookie is set by the response. `refresh()` before `replace()` discards
         * the router cache, which otherwise still holds the signed-out render of the
         * destination and would show it for a beat after signing in.
         */
        router.refresh();
        router.replace(next);
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string; fields?: Record<string, string> } }
        | null;

      if (payload?.error?.fields) setFieldErrors(payload.error.fields as FieldErrors);
      setFormError(payload?.error?.message ?? 'Something went wrong. Please try again.');
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {isSignup && (
        <Field
          id="name"
          label="Your name"
          value={name}
          onChange={setName}
          autoComplete="name"
          error={fieldErrors.name}
        />
      )}

      <Field
        id="email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        // Tells password managers and mobile keyboards exactly what this is.
        autoComplete={isSignup ? 'email' : 'username'}
        error={fieldErrors.email}
      />

      <Field
        id="password"
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete={isSignup ? 'new-password' : 'current-password'}
        error={fieldErrors.password}
        hint={isSignup ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
      />

      {formError !== null && (
        // role="alert" so it is announced when it appears, without moving focus.
        <p role="alert" className="mb-3 rounded-md bg-danger-soft p-2.5 text-sm text-danger">
          {formError}
        </p>
      )}

      <Button type="submit" fullWidth size="lg" disabled={isSubmitting}>
        {isSubmitting ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
      </Button>

      <p className="mt-4 text-center text-sm text-fg-muted">
        {isSignup ? 'Already have an account? ' : 'New here? '}
        <Link
          // Carry the destination across, so switching form does not lose where they
          // were originally headed.
          href={`${isSignup ? '/login' : '/signup'}?next=${encodeURIComponent(next)}`}
          className="text-info underline"
        >
          {isSignup ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: string;
  autoComplete?: string;
  error?: string;
  hint?: string;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        aria-invalid={error !== undefined}
        // Associates both the hint and the error with the input, so a screen reader reads
        // them as part of the field rather than as stray text.
        aria-describedby={
          [error !== undefined ? errorId : null, hint !== undefined ? hintId : null]
            .filter(Boolean)
            .join(' ') || undefined
        }
        className="min-h-11 w-full rounded-md border border-border bg-surface px-3"
      />
      {hint !== undefined && error === undefined && (
        <p id={hintId} className="mt-1 text-xs text-fg-subtle">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
