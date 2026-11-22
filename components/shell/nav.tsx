'use client';

/**
 * Global navigation model for the Darsak shell — the single source of truth
 * for the sidebar. Items map to routes that exist today; everything else is
 * honestly marked as coming soon rather than linked to a dead end.
 */
import {
  BookOpen,
  FlaskConical,
  MessageSquare,
  PenLine,
  Search,
  Target,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

export interface ShellNavItem {
  key: string;
  icon: LucideIcon;
  href?: string;
}

export const SHELL_NAV_ITEMS: ShellNavItem[] = [
  { key: 'courses', icon: BookOpen, href: '/' },
  { key: 'tutor', icon: MessageSquare, href: '/tutor' },
  { key: 'board', icon: PenLine, href: '/whiteboard' },
  { key: 'search', icon: Search, href: '/search' },
  { key: 'plans', icon: Target, href: '/plans' },
  { key: 'tests', icon: FlaskConical, href: '/tests' },
  { key: 'leaderboard', icon: Trophy, href: '/leaderboard' },
];

/** Highlights the nav item whose route prefix matches the pathname. */
export function activeNavKey(pathname: string | null): string | null {
  if (!pathname) return null;
  const exact = SHELL_NAV_ITEMS.find((item) => item.href === pathname);
  if (exact) return exact.key;
  const prefix = SHELL_NAV_ITEMS.find(
    (item) => item.href && item.href !== '/' && pathname.startsWith(`${item.href}/`),
  );
  return prefix?.key ?? null;
}
