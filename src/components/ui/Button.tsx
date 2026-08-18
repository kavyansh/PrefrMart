import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Server-safe button. No client boundary: this renders as a plain <button>, so a
 * page using it does not ship JS for the button itself.
 *
 * Minimum height is 44px on every size so touch targets meet the accessibility
 * guidance without callers having to remember.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-fg border-accent-strong hover:bg-accent-strong active:bg-accent-strong',
  secondary:
    'bg-surface text-fg border-border-strong hover:bg-surface-sunken active:bg-surface-sunken',
  ghost: 'bg-transparent text-fg border-transparent hover:bg-surface-sunken',
  danger: 'bg-danger text-fg-inverse border-danger hover:opacity-90',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-5 text-base',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md border font-medium',
        'transition-colors duration-(--duration-fast)',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
