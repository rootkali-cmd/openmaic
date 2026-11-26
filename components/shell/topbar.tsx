'use client';

/**
 * Section top bar for the Darsak shell: mobile drawer trigger on a phone and
 * the section title. The timer moved out to the floating dial (see
 * study-timer.tsx), so the bar stays a thin, quiet line instead of holding a
 * full-width strip of controls.
 */
import type { ReactNode } from 'react';

import { GuestAuthActions } from './guest-auth-actions';
import { LanguageToggle } from '@/components/language-toggle';
import { MobileNav } from './mobile-nav';

export function ShellTopbar({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="relative z-30 flex h-[52px] shrink-0 items-center gap-3 px-3 md:px-5">
      <MobileNav />
      <h1 className="shrink-0 truncate text-[15px] font-bold text-white">{title}</h1>

      <div className="ms-auto flex items-center gap-2">
        {actions}
        <LanguageToggle />
        <GuestAuthActions />
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent"
      />
    </header>
  );
}
