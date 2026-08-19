'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/passwordPolicy';
import { signInMessage } from '@/lib/auth/signInErrors';

/**
 * Shared sign-in / sign-up form.
 *
 * One component for both because they differ only by an extra field and an endpoint. Two
 * near-identical forms would drift — one gaining an accessibility fix or an error-mapping
 * improvement the other never gets.
 *
 * Field errors returned by the server are mapped straight onto the inputs, so a rejection
 * lands next to the thing that caused it rather than as a banner the user has to interpret.
 *
 * Sign-up is two requests: POST /api/auth/signup creates the row, then `signIn` establishes
 * the session. NextAuth has no registration flow for credentials, and a cookie it did not
 * mint would not be one NextAuth recognises.
 */

type Mode = 'login' | 'signup';

type FieldErrors = Partial<Record<'email' | 'password' | 'name', string>>;

export function AuthForm({
  mode,
  next,
  initialError,
}: {
  mode: Mode;
  next: string;
  /** NextAuth error type from `?error=`, set when an OAuth attempt bounced back here. */
  initialError?: string;
}) {
  const router = useRouter();
  const isSignup = mode === 'signup';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(
    initialError === undefined ? null : signInMessage(initialError),
  );
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
      if (isSignup) {
        // Create the row first. Field-level rejections (duplicate email, short password)
        // come back from here, not from signIn.
        const response = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: { message?: string; fields?: Record<string, string> } }
            | null;

          if (payload?.error?.fields) setFieldErrors(payload.error.fields as FieldErrors);
          setFormError(payload?.error?.message ?? 'Something went wrong. Please try again.');
          return;
        }
      }

      const result = await signIn('credentials', {
        email: email.trim(),
        password,
        // Handle the outcome here rather than letting NextAuth navigate, so a failure lands
        // as an inline message instead of a round-trip through the error page.
        redirect: false,
      });

      if (result.ok && result.error === undefined) {
        /*
         * `refresh()` before `replace()` discards the router cache, which otherwise still
         * holds the signed-out render of the destination and would show it for a beat
         * after signing in.
         */
        router.refresh();
        router.replace(next);
        return;
      }

      setFormError(signInMessage(result.error, result.code));
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {/*
        Above the provider buttons rather than beside the submit button, because it now
        reports two different journeys: a rejected password, and an OAuth attempt bounced
        back here with ?error=. role="alert" announces it without moving focus.
      */}
      {formError !== null && (
        <p role="alert" className="mb-4 rounded-md bg-danger-soft p-2.5 text-sm text-danger">
          {formError}
        </p>
      )}

      {/*
        Providers first: someone who has an account through Google is looking for the button,
        not the fields. Outside the <form> so they carry no submit semantics.
      */}
      <div className="mb-5 grid gap-2">
        <ProviderButton provider="google" label="Continue with Google" next={next} />
        <ProviderButton provider="github" label="Continue with GitHub" next={next} />
      </div>

      <div className="mb-5 flex items-center gap-3">
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
        <span className="text-xs text-fg-subtle">or</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>

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
    </>
  );
}

/**
 * Starts an OAuth journey. A full redirect, not `redirect: false` — the handshake leaves the
 * site and comes back, so there is no in-page result to handle. A rejection returns to this
 * page as `?error=`, which the login page reads and passes in as `initialError`.
 */
function ProviderButton({
  provider,
  label,
  next,
}: {
  provider: 'google' | 'github';
  label: string;
  next: string;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      fullWidth
      onClick={() => void signIn(provider, { redirectTo: next })}
    >
      {label}
    </Button>
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
