import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-fg-muted border-border',
  success: 'bg-success-soft text-success border-success/25',
  danger: 'bg-danger-soft text-danger border-danger/25',
  warning: 'bg-warning-soft text-warning border-warning/25',
  info: 'bg-info-soft text-info border-info/25',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
