'use client';

/**
 * Mobile navigation — the sidebar is a fixed rail that only exists from the
 * `md` breakpoint up, so on a phone every section used to be unreachable.
 * This is the drawer that replaces it: the same items in the same order, the
 * PRO entry to the pricing page, and a sign-in row for guests.
 */
import { Menu, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useI18n } from '@/lib/hooks/use-i18n';
import { DARSAK_LOGIN_URL, DARSAK_PRICING_URL } from '@/lib/site-links';

import { SHELL_NAV_ITEMS, activeNavKey } from './nav';

export function MobileNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  const activeKey = activeNavKey(pathname);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="افتح القائمة"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="grid size-9 shrink-0 place-items-center rounded-full text-white/60 transition hover:bg-white/[0.06] hover:text-white md:hidden"
      >
        <Menu className="size-4.5" aria-hidden />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="اقفل القائمة"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[#05060B]/70 backdrop-blur-sm"
          />
          <div className="absolute inset-x-3 top-3 rounded-3xl border border-white/10 bg-[#0E111B] p-4 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)]">
            <div className="flex items-center gap-2">
              <Link
                href="/tutor"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5"
              >
                <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-[#9178E6] to-[#5B3FC7] text-white">
                  <svg viewBox="0 0 24 24" className="size-4.5" fill="currentColor" aria-hidden>
                    <path d="M12 1.8c.7 4.9 3.5 7.7 8.4 8.4v3.6c-4.9.7-7.7 3.5-8.4 8.4h-3.6c-.7-4.9-3.5-7.7-8.4-8.4V9.8c4.9-.7 7.7-3.5 8.4-8.4h3.6Z" />
                  </svg>
                </span>
                <span className="text-[14px] font-black tracking-tight text-white">
                  Darsak <span className="text-[#9178E6]">AI</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="اقفل القائمة"
                className="ms-auto grid size-8 place-items-center rounded-full text-white/50 transition hover:bg-white/[0.06] hover:text-white"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <nav className="mt-4 flex flex-col gap-0.5">
              {SHELL_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.key === activeKey;
                return (
                  <Link
                    key={item.key}
                    href={item.href ?? '/tutor'}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${
                      active
                        ? 'bg-white/[0.08] text-white'
                        : 'text-white/60 hover:bg-white/[0.05] hover:text-white/90'
                    }`}
                  >
                    <Icon
                      className={`size-4.5 shrink-0 ${active ? 'text-[#9178E6]' : ''}`}
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{t(`shell.nav.${item.key}`)}</span>
                    {active ? (
                      <span className="size-1.5 rounded-full bg-[#9178E6]" aria-hidden />
                    ) : null}
                  </Link>
                );
              })}
            </nav>

            <a
              href={DARSAK_PRICING_URL}
              onClick={() => setOpen(false)}
              className="mt-3 flex items-center gap-2 rounded-2xl border border-[#9178E6]/25 bg-[#9178E6]/10 px-3 py-2.5 text-[12px] font-semibold text-white/85"
            >
              <Sparkles className="size-4 text-[#B9A8FF]" aria-hidden />
              {t('shell.pro.title')}
              <span className="ms-auto text-[10.5px] text-[#B9A8FF]/80">
                {t('shell.pro.cta')}
              </span>
            </a>

            <a
              href={DARSAK_LOGIN_URL}
              onClick={() => setOpen(false)}
              className="mt-2 flex items-center justify-center rounded-2xl border border-white/10 px-3 py-2.5 text-[12px] font-semibold text-white/70"
            >
              {t('shell.guest.hint')}
            </a>
          </div>
        </div>
      ) : null}
    </>
  );
}
