'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { imageSrc } from '@/lib/catalog/taxonomy';

/**
 * Product image gallery with thumbnails.
 *
 * The only reason this is a client component is selecting which image is large. The first
 * image renders with `priority` because on a product page it is almost always the LCP
 * element — leaving it lazy is a measurable LCP regression.
 *
 * Thumbnails are a radiogroup rather than a list of buttons: they are a single-choice
 * control, and that is what a screen reader should hear.
 */
export function ProductGallery({ images, title }: { images: string[]; title: string }) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div
        aria-hidden="true"
        className="aspect-square w-full rounded-lg border border-border bg-surface-sunken"
      />
    );
  }

  const active = images[Math.min(activeIndex, images.length - 1)]!;

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-surface">
        <Image
          src={imageSrc(active)}
          // The product title is already the page h1 directly beside this, so a
          // descriptive alt here would be read twice. Empty alt marks it decorative.
          alt=""
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          priority
          className="object-cover"
        />
      </div>

      {images.length > 1 && (
        <div
          role="radiogroup"
          aria-label={`${title} images`}
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
        >
          {images.map((image, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={image}
                type="button"
                role="radio"
                aria-checked={isActive}
                aria-label={`Image ${index + 1} of ${images.length}`}
                onClick={() => setActiveIndex(index)}
                className={cn(
                  'relative h-16 w-16 shrink-0 overflow-hidden rounded-md border-2',
                  isActive ? 'border-ink' : 'border-border',
                )}
              >
                <Image
                  src={imageSrc(image)}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
