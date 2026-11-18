'use client';

/**
 * App shell — fixed dark sidebar + section top bar + content surface.
 * Every main Darsak section renders inside this frame so navigation,
 * timing and branding stay consistent across the product.
 */
import type { ReactNode } from 'react';

import { ShellSidebar } from './sidebar';
import { ShellTopbar } from './topbar';

export function AppShell({
  title,
  actions,
  children,
  contentClassName,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Extra classes for the content surface (e.g. whiteboard needs no padding). */
  contentClassName?: string;
}) {
  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#0B0D16]">
      <ShellSidebar />
      <div className="flex h-screen flex-col md:pl-[236px]">
        <ShellTopbar title={title} actions={actions} />
        <main
          className={`darsak-shell-content relative min-h-0 flex-1 ${contentClassName ?? ''}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
