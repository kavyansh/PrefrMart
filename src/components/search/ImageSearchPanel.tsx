'use client';

import { useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ProductCard } from '@/components/product/ProductCard';
import { ProductGridSkeleton } from '@/components/ui/Skeleton';
import { MAX_UPLOAD_BYTES } from '@/lib/search/upload';
import type { ProductListItem } from '@/lib/catalog/products';

/**
 * Search by photo.
 *
 * The matching behind this is a stub — no image analysis happens. That is stated in the UI, twice,
 * because the mechanics around it are convincing enough to be mistaken for the real thing: the file
 * picker works, camera capture works on a phone, the file is validated, and the results render
 * exactly like any other product grid. Without the label, the feature would be a lie.
 *
 * `capture="environment"` is what makes the button open the rear camera on a phone rather than the
 * photo library, which is the whole point of searching by photo while standing in front of the thing
 * you want.
 *
 * The preview uses a blob: URL, revoked when replaced, so a shopper trying several photos does not
 * leak a URL per attempt for the life of the page.
 */
export function ImageSearchPanel() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [results, setResults] = useState<ProductListItem[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setPreview(file: File | null) {
    if (previewUrlRef.current !== null) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    if (file === null) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }

  async function handleFile(file: File) {
    setError(null);
    setResults(null);

    // Check size before uploading: no point spending a shopper's data to be told it is too big.
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Images must be under 4MB.');
      setPreview(null);
      return;
    }

    setPreview(file);
    setIsSearching(true);

    try {
      const form = new FormData();
      form.append('image', file);

      const response = await fetch('/api/search/image', { method: 'POST', body: form });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? 'Could not search with that image.');
        return;
      }

      const payload = (await response.json()) as { items: ProductListItem[] };
      setResults(payload.items);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <section aria-labelledby="image-search-heading" className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 id="image-search-heading" className="text-base font-semibold">
          Search by photo
        </h2>
        <Badge tone="warning">Demo stub</Badge>
      </div>

      <p className="mb-4 text-sm text-fg-muted">
        Upload or photograph a product. <strong>This is a demonstration stub</strong> — the upload and
        validation are real, but no image analysis happens, so the results below are arbitrary
        products rather than genuine visual matches. The same photo always returns the same set.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        // Opens the rear camera on a phone instead of the photo library.
        capture="environment"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) void handleFile(file);
          // Reset so choosing the same file twice fires change again.
          event.target.value = '';
        }}
      />

      <div className="flex flex-wrap items-start gap-4">
        <Button onClick={() => inputRef.current?.click()} disabled={isSearching} size="lg">
          {isSearching ? 'Searching…' : previewUrl === null ? 'Choose a photo' : 'Try another photo'}
        </Button>

        {previewUrl !== null && (
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border border-border">
            {/*
              A local blob: URL, so next/image would gain nothing and cannot optimise it. The
              eslint rule wants next/image everywhere; this is the case it does not apply to.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="The photo you uploaded" className="h-full w-full object-cover" />
          </div>
        )}
      </div>

      {error !== null && (
        <p role="alert" className="mt-3 rounded-md bg-danger-soft p-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      <p aria-live="polite" className="sr-only">
        {isSearching
          ? 'Searching by photo'
          : results !== null
            ? `${results.length} products found`
            : ''}
      </p>

      {isSearching && (
        <div className="mt-5">
          <ProductGridSkeleton count={6} />
        </div>
      )}

      {results !== null && !isSearching && (
        <div className="mt-5">
          <div className="mb-3 rounded-md bg-warning-soft p-2.5 text-sm text-warning">
            These {results.length} results are produced by a stub and are{' '}
            <strong>not visual matches</strong> for your photo.
          </div>

          {results.length === 0 ? (
            <p className="text-sm text-fg-muted">No products to show.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {results.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
