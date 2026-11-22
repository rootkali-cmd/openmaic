'use client';

/**
 * App shell — dark navigation rail, section top bar and content surface.
 * Every main Darsak section renders inside this frame so navigation, timing
 * and branding stay consistent across the product.
 *
 * The rail lives on the reading-start edge and collapses; the content offset
 * follows it (`ps` is logical, so RTL puts the space on the right where the
 * rail is). `--darsak-rail` exposes the current rail width to children that
 * position themselves against the viewport (the home page's tool cluster).
 * Shell routes hide the document scrollbar: their surfaces scroll inside the
 * frame, so the root one would only be an empty gutter.
 */
import { useEffect, type ReactNode } from 'react';

import { useNavCollapsed } from './nav-collapsed';
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
  const collapsed = useNavCollapsed();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('darsak-shell-page');
    return () => root.classList.remove('darsak-shell-page');
  }, []);

  return (
    <div
      className="darsak-shell relative h-screen w-full overflow-hidden bg-[#0B0D16]"
      style={{ ['--darsak-rail' as string]: collapsed ? '76px' : '236px' }}
    >
      <ShellSidebar />
      <div
        className={`flex h-screen flex-col transition-[padding] duration-200 ${
          collapsed ? 'md:ps-[76px]' : 'md:ps-[236px]'
        }`}
      >
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
