'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { LogoutButton } from '@/components/account/LogoutButton';
import { cn } from '@/lib/cn';

/**
 * Settings navigation — requirement 6.
 *
 * A persistent rail on desktop, and the same links inside a sheet on mobile, where a permanent
 * sidebar would eat most of the viewport. One component renders both so the two can never
 * offer different destinations.
 *
 * `aria-current="page"` marks the active link, which is how a screen reader conveys "you are
 * here"; colour alone would not.
 */

const LINKS = [
  { href: '/account/profile', label: 'Profile' },
  { href: '/account/orders', label: 'Orders' },
] as const;

export function SettingsNav({ userName }: { userName: string }) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  const links = (
    <ul className="space-y-1">
      {LINKS.map((link) => {
        const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => setSheetOpen(false)}
              className={cn(
                'flex min-h-11 items-center rounded-md px-3 text-sm',
                isActive
                  ? 'bg-surface-sunken font-medium text-fg'
                  : 'text-fg-muted hover:bg-surface-sunken',
              )}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {/* Mobile trigger */}
      <div className="mb-4 lg:hidden">
        <Button variant="secondary" size="sm" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
          <MenuIcon />
          Settings menu
        </Button>
      </div>

      {/* Desktop rail */}
      <nav aria-label="Settings" className="hidden lg:block lg:w-52 lg:shrink-0">
        <p className="mb-3 px-3 text-sm font-semibold">{userName}</p>
        {links}
        <div className="mt-6 px-1">
          <LogoutButton />
        </div>
      </nav>

      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Settings"
        description={userName}
        footer={<LogoutButton />}
      >
        <nav aria-label="Settings">{links}</nav>
      </Sheet>
    </>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
