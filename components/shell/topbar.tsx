'use client';

/**
 * Section top bar for the Darsak shell: section title on the reading start,
 * and — on the far edge — the tappable focus timer that keeps counting
 * across navigation. No gamified counters until a system exists behind them.
 */
import type { ReactNode } from 'react';

import { StudyTimer } from './study-timer';

export function ShellTopbar({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <header className="relative z-30 flex h-[52px] shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#0B0D16] px-5">
      <h1 className="shrink-0 text-[15px] font-bold text-white">{title}</h1>

      <div className="ms-auto flex items-center gap-2">
        {actions}
        <StudyTimer />
      </div>
    </header>
  );
}
