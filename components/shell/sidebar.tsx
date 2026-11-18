'use client';

/**
 * Fixed dark sidebar — the Darsak navigation rail. Mirrors the reference
 * layout: logo, section links, and the profile card pinned at the bottom.
 * Sections that do not exist yet render as muted "soon" rows.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useI18n } from '@/lib/hooks/use-i18n';

import { SHELL_NAV_ITEMS, activeNavKey } from './nav';

export function ShellSidebar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const activeKey = activeNavKey(pathname);

  return (
    <aside className="fixed top-0 left-0 z-40 hidden h-screen w-[236px] flex-col border-r border-white/[0.06] bg-[#0B0D16] md:flex">
      <Link
        href="/tutor"
        className="flex items-center gap-2.5 px-5 pt-5 pb-4"
        aria-label={t('shell.home')}
      >
        <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-[#9178E6] to-[#5B3FC7] text-white shadow-[0_6px_16px_-8px_#9178E6]">
          <svg viewBox="0 0 24 24" className="size-4.5" fill="currentColor" aria-hidden>
            <path d="M12 1.8c.7 4.9 3.5 7.7 8.4 8.4v3.6c-4.9.7-7.7 3.5-8.4 8.4h-3.6c-.7-4.9-3.5-7.7-8.4-8.4V9.8c4.9-.7 7.7-3.5 8.4-8.4h3.6Z" />
          </svg>
        </span>
        <span className="text-[15px] font-black tracking-tight text-white">
          Darsak <span className="text-[#9178E6]">AI</span>
        </span>
      </Link>

      <nav className="flex flex-col gap-0.5 px-3" aria-label={t('shell.nav_label')}>
        {SHELL_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.key === activeKey;
          const label = t(`shell.nav.${item.key}`);

          if (item.href === undefined) {
            return (
              <span
                key={item.key}
                className="flex cursor-default items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-white/35"
                title={t('shell.soon')}
              >
                <Icon className="size-4.5 shrink-0" aria-hidden />
                <span className="flex-1 truncate">{label}</span>
                <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-white/40">
                  {t('shell.soon')}
                </span>
              </span>
            );
          }

          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${
                active
                  ? 'bg-white/[0.08] text-white'
                  : 'text-white/55 hover:bg-white/[0.05] hover:text-white/85'
              }`}
            >
              <Icon
                className={`size-4.5 shrink-0 ${active ? 'text-[#9178E6]' : ''}`}
                aria-hidden
              />
              <span className="flex-1 truncate">{label}</span>
              {active ? (
                <span className="size-1.5 rounded-full bg-[#9178E6]" aria-hidden />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-4 pb-4">
        <div className="rounded-2xl border border-[#9178E6]/25 bg-[#9178E6]/10 px-3.5 py-3">
          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-[#9178E6] px-1.5 py-0.5 text-[8px] font-black text-[#0B0D16]">
              PRO
            </span>
            <span className="text-[11.5px] font-semibold text-white/85">
              {t('shell.pro.title')}
            </span>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-5 text-white/45">{t('shell.pro.blurb')}</p>
        </div>

        <div className="mt-3 flex items-center gap-2.5 px-1">
          <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-[#FB7E5B] to-[#E879C0] text-[11px] font-black text-white">
            ض
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold text-white/80">
              {t('shell.guest.name')}
            </p>
            <p className="truncate text-[10px] text-white/40">{t('shell.guest.hint')}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
