'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

/**
 * Review submission form.
 *
 * Validation is duplicated on purpose: these client-side checks are a UX affordance so the
 * user is not made to wait for a round trip to be told the title is too short. The server's
 * Zod parse is the actual trust boundary, and field errors returned from it are mapped back
 * onto the inputs below.
 *
 * XSS note: the body is submitted and later rendered as a text node by React, which escapes
 * it. Nothing in this path uses `dangerouslySetInnerHTML` — and `react/no-danger` is an
 * ESLint error, so nothing can start.
 */

const MIN_TITLE = 3;
const MIN_BODY = 10;
const MAX_BODY = 4_000;

type FieldErrors = Partial<Record<'rating' | 'title' | 'body', string>>;

export function ReviewForm({ productSlug }: { productSlug: string }) {
  const router = useRouter();

  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (rating < 1) errors.rating = 'Choose a star rating.';
    if (title.trim().length < MIN_TITLE) errors.title = 'Give your review a short title.';
    if (body.trim().length < MIN_BODY) {
      errors.body = `Tell us a little more — at least ${MIN_BODY} characters.`;
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
      const response = await fetch(`/api/products/${productSlug}/reviews`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating, title: title.trim(), body: body.trim() }),
      });

      if (response.ok) {
        setIsDone(true);
        /*
         * The rating average, rater count and histogram all live in the server-rendered
         * part of the page. router.refresh() re-runs that render so they update together,
         * rather than us patching four numbers on the client and risking disagreement.
         */
        router.refresh();
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string; fields?: Record<string, string> } }
        | null;

      if (payload?.error?.fields) {
        setFieldErrors(payload.error.fields as FieldErrors);
      }
      setFormError(payload?.error?.message ?? 'Could not submit your review.');
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isDone) {
    return (
      <div
        className="rounded-lg border border-success/30 bg-success-soft p-4"
        // Announced without stealing focus.
        role="status"
      >
        <p className="text-sm font-medium text-success">Thanks — your review is published.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-3 text-base font-semibold">Write a review</h3>

      <fieldset className="mb-4">
        <legend className="mb-1.5 block text-sm font-medium">Your rating</legend>
        <StarPicker value={rating} onChange={setRating} />
        {fieldErrors.rating !== undefined && <FieldError>{fieldErrors.rating}</FieldError>}
      </fieldset>

      <div className="mb-4">
        <label htmlFor="review-title" className="mb-1.5 block text-sm font-medium">
          Title
        </label>
        <input
          id="review-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          // Ties the message to the input for assistive tech, rather than leaving it as
          // unassociated text nearby.
          aria-invalid={fieldErrors.title !== undefined}
          aria-describedby={fieldErrors.title !== undefined ? 'review-title-error' : undefined}
          className="min-h-11 w-full rounded-md border border-border bg-surface px-3"
          placeholder="Sums up your experience"
        />
        {fieldErrors.title !== undefined && (
          <FieldError id="review-title-error">{fieldErrors.title}</FieldError>
        )}
      </div>

      <div className="mb-4">
        <label htmlFor="review-body" className="mb-1.5 block text-sm font-medium">
          Your review
        </label>
        <textarea
          id="review-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={MAX_BODY}
          rows={5}
          aria-invalid={fieldErrors.body !== undefined}
          aria-describedby={fieldErrors.body !== undefined ? 'review-body-error' : undefined}
          className="w-full rounded-md border border-border bg-surface p-3"
          placeholder="What did you like or dislike? How did you use it?"
        />
        <p className="mt-1 text-xs text-fg-subtle">
          {body.length.toLocaleString('en-IN')} / {MAX_BODY.toLocaleString('en-IN')}
        </p>
        {fieldErrors.body !== undefined && (
          <FieldError id="review-body-error">{fieldErrors.body}</FieldError>
        )}
      </div>

      {formError !== null && (
        <p role="alert" className="mb-3 rounded-md bg-danger-soft p-2.5 text-sm text-danger">
          {formError}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Submitting…' : 'Submit review'}
      </Button>
    </form>
  );
}

/**
 * Star input as a radiogroup. Arrow keys move between options natively for radios, which a
 * row of buttons would not give — and rating is exactly a single-choice control.
 */
function StarPicker({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <label
          key={star}
          className={cn(
            'flex h-11 w-11 cursor-pointer items-center justify-center rounded-md',
            'hover:bg-surface-sunken',
            // focus-within, because the real radio is visually hidden.
            'focus-within:outline-2 focus-within:outline-info',
          )}
        >
          <input
            type="radio"
            name="rating"
            value={star}
            checked={value === star}
            onChange={() => onChange(star)}
            className="sr-only"
          />
          <span className="sr-only">
            {star} {star === 1 ? 'star' : 'stars'}
          </span>
          <svg
            viewBox="0 0 24 24"
            className={cn('h-7 w-7', star <= value ? 'text-star' : 'text-star-empty')}
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.35l-5.8 3.05 1.1-6.45-4.7-4.6 6.5-.95z" />
          </svg>
        </label>
      ))}
    </div>
  );
}

function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-1 text-sm text-danger">
      {children}
    </p>
  );
}
