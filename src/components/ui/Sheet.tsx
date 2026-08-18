'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Bottom sheet (mobile) / side panel, built on the native <dialog> element.
 *
 * Originally this used Radix Dialog, on the reasoning that modal correctness — focus
 * trapping, focus restore, Escape handling, `aria-modal`, inert background content — is
 * genuinely hard to hand-roll. That reasoning holds, but `showModal()` gets all of it from
 * the browser, so the dependency bought nothing. Measured, Radix was 11.7KB gzipped of
 * first-load JS; the native element is free.
 *
 * What the browser handles for us:
 *  - focus moves into the dialog and is trapped there
 *  - focus returns to the trigger on close
 *  - Escape closes it (fires `cancel`, then `close`)
 *  - background content becomes inert and is hidden from assistive tech
 *  - `::backdrop` renders the scrim
 *
 * What we still handle: body scroll locking, and keeping the `open` prop in sync with the
 * element's imperative open/close API.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  side = 'bottom',
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required: a dialog with no accessible name is announced as just "dialog". */
  title: string;
  description?: string;
  side?: 'bottom' | 'right';
  children: ReactNode;
  footer?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  // Drive the imperative API from the declarative prop. showModal() is what buys the
  // focus trap and inert backdrop; setting the `open` attribute directly would not.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Lock background scrolling while open, so dragging the page behind the sheet does
  // not move the listing underneath it.
  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="sheet-title"
      aria-describedby={description !== undefined ? 'sheet-description' : undefined}
      // `close` fires for Escape, backdrop-driven close and close() alike, so this is the
      // single place state needs syncing back to the parent.
      onClose={() => onOpenChange(false)}
      // Clicking the backdrop hits the dialog element itself rather than its content.
      onClick={(event) => {
        if (event.target === dialogRef.current) onOpenChange(false);
      }}
      className={cn(
        'max-h-none max-w-none border-0 bg-surface p-0 text-fg shadow-xl',
        'backdrop:bg-black/50',
        // `open:flex` — a closed <dialog> must stay display:none, so the layout
        // display value can only be applied while it is open.
        'open:flex open:flex-col',
        side === 'bottom'
          ? // Capped at 85dvh: seeing part of the page behind the sheet keeps the user
            // oriented about where they are.
            'mt-auto mb-0 h-auto max-h-[85dvh] w-full rounded-t-xl sm:mx-auto sm:max-w-lg'
          : 'my-0 ml-auto h-full max-h-full w-full max-w-sm',
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div>
          <h2 id="sheet-title" className="text-base font-semibold">
            {title}
          </h2>
          {description !== undefined && (
            <p id="sheet-description" className="mt-0.5 text-sm text-fg-muted">
              {description}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className="-mt-1 -mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-surface-sunken"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>

      {footer !== undefined && <div className="border-t border-border px-4 py-3">{footer}</div>}
    </dialog>
  );
}
