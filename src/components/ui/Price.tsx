import { cn } from '@/lib/cn';
import { discountPercent, formatMoney } from '@/lib/money';

/**
 * Price with optional strike-through list price and discount percentage.
 *
 * Accessibility detail: the struck-through list price is wrapped in a <s> with an
 * off-screen "was" label, so it is not announced as if it were the current price.
 */
export function Price({
  priceCents,
  listCents = null,
  currency,
  size = 'md',
  className,
}: {
  priceCents: number;
  listCents?: number | null;
  currency?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const percent = discountPercent(priceCents, listCents);

  const sizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
    xl: 'text-2xl',
  } as const;

  return (
    <span className={cn('flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5', className)}>
      <span className={cn('font-semibold text-price', sizes[size])}>
        {formatMoney(priceCents, currency)}
      </span>

      {listCents !== null && percent !== null && (
        <>
          <s className="text-xs text-fg-subtle">
            <span className="sr-only">Was </span>
            {formatMoney(listCents, currency)}
          </s>
          <span className="text-xs font-medium text-deal">({percent}% off)</span>
        </>
      )}
    </span>
  );
}
