'use client';

/**
 * Fixed dark navigation rail — the Darsak sidebar.
 *
 * It sits on the reading-start edge (`start-0`, so the right side in Arabic
 * RTL and the left side in LTR) and can collapse to an icon-only rail; the
 * choice is remembered per browser (see nav-collapsed.ts). The profile card
 * reads the signed-in student from the Darsak handoff (name and email ride
 * the session cookie) and falls back to an honest guest card that links to
 * the landing sign-in.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { DarsakMascot } from '@/components/mascot/darsak-mascot';
import { useI18n } from '@/lib/hooks/use-i18n';
import { DARSAK_LOGIN_URL, DARSAK_PRICING_URL } from '@/lib/site-links';

import { useNavCollapsed, setCollapsed } from './nav-collapsed';
import { SHELL_NAV_ITEMS, activeNavKey } from './nav';

interface DarsakProfile {
  name: string | null;
  email: string | null;
}

export function ShellSidebar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const activeKey = activeNavKey(pathname);
  const collapsed = useNavCollapsed();
  const [profile, setProfile] = useState<DarsakProfile | null>(null);

  // Who is signed in? The handoff already put the profile on the session
  // cookie; this reads it from our own route (never from client input).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/identity/me', { cache: 'no-store' })
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{
              signedIn?: boolean;
              name?: string | null;
              email?: string | null;
            }>)
          : null,
      )
      .then((data) => {
        if (cancelled || !data?.signedIn) return;
        setProfile({ name: data.name ?? null, email: data.email ?? null });
      })
      .catch(() => {
        /* no profile route (older deploy) — the guest card is the safe default */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = profile ? (profile.name ?? profile.email?.split('@')[0] ?? 'طالب دارس') : '';
  const initial = displayName.trim().charAt(0) || 'د';
  const toggleLabel = collapsed ? 'افتح القائمة' : 'اطوِ القائمة';

  return (
    <aside
      data-collapsed={collapsed ? 'true' : 'false'}
      className={`fixed top-0 start-0 z-40 hidden h-screen flex-col bg-[#090c18] transition-[width] duration-200 md:flex ${
        collapsed ? 'w-[76px]' : 'w-[236px]'
      }`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 end-0 w-px bg-gradient-to-b from-transparent via-white/[0.09] to-transparent"
      />
      {/* Brand + collapse toggle share the top row, inside the rail. */}
      <div
        className={`flex shrink-0 items-center gap-2 pt-5 pb-4 ${
          collapsed ? 'flex-col gap-2.5 px-0' : 'px-5'
        }`}
      >
        <Link
          href="/"
          className={`flex min-w-0 items-center gap-2.5 ${collapsed ? '' : 'flex-1'}`}
          aria-label={t('shell.home')}
          title={collapsed ? 'Darsak AI' : undefined}
        >
          <DarsakMascot className="size-9 shrink-0" />
          {collapsed ? null : (
            <span className="truncate text-[15px] font-black tracking-tight text-white">
              Darsak <span className="text-[#9178E6]">AI</span>
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          title={toggleLabel}
          className="grid size-6 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-white/45 transition hover:border-[#9178E6]/45 hover:bg-white/[0.08] hover:text-white"
        >
          {collapsed ? (
            <ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden />
          ) : (
            <ChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden />
          )}
        </button>
      </div>

      <nav
        className={`flex flex-col gap-0.5 ${collapsed ? 'px-2' : 'px-3'}`}
        aria-label={t('shell.nav_label')}
      >
        {SHELL_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.key === activeKey;
          const label = t(`shell.nav.${item.key}`);

          if (item.href === undefined) {
            return (
              <span
                key={item.key}
                className={`flex cursor-default items-center gap-3 rounded-xl py-2.5 text-[13px] text-white/35 ${
                  collapsed ? 'justify-center px-0' : 'px-3'
                }`}
                title={collapsed ? `${label} — ${t('shell.soon')}` : t('shell.soon')}
              >
                <Icon className="size-4.5 shrink-0" aria-hidden />
                {collapsed ? null : <span className="flex-1 truncate">{label}</span>}
                {collapsed ? null : (
                  <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-white/40">
                    {t('shell.soon')}
                  </span>
                )}
              </span>
            );
          }

          const rowClass = `relative flex items-center gap-3 rounded-xl py-2.5 text-[13px] font-medium transition ${
            collapsed ? 'justify-center px-0' : 'px-3'
          } ${
            active
              ? 'bg-white/[0.08] text-white'
              : 'text-white/55 hover:bg-white/[0.05] hover:text-white/85'
          }`;
          const content = (
            <>
              <Icon className={`size-4.5 shrink-0 ${active ? 'text-[#9178E6]' : ''}`} aria-hidden />
              {collapsed ? (
                active ? (
                  <span className="absolute end-0 size-1.5 rounded-full bg-[#9178E6]" aria-hidden />
                ) : null
              ) : (
                <>
                  <span className="flex-1 truncate">{label}</span>
                  {active ? (
                    <span className="size-1.5 rounded-full bg-[#9178E6]" aria-hidden />
                  ) : null}
                </>
              )}
            </>
          );

          if (item.external) {
            return (
              <a
                key={item.key}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                aria-label={collapsed ? label : undefined}
                title={collapsed ? label : undefined}
                className={rowClass}
              >
                {content}
              </a>
            );
          }

          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              aria-label={collapsed ? label : undefined}
              title={collapsed ? label : undefined}
              className={rowClass}
            >
              {content}
            </Link>
          );
        })}
      </nav>

      <div className={`mt-auto pb-4 ${collapsed ? 'px-2' : 'px-4'}`}>
        <a
          href={DARSAK_PRICING_URL}
          className={`group block rounded-2xl border border-[#9178E6]/25 bg-[#9178E6]/10 transition hover:border-[#9178E6]/50 hover:bg-[#9178E6]/15 focus-visible:border-[#9178E6]/60 focus-visible:outline-none ${
            collapsed ? 'flex justify-center py-3' : 'px-3.5 py-3'
          }`}
          aria-label={`${t('shell.pro.title')} — ${t('shell.pro.cta')}`}
          title={collapsed ? `${t('shell.pro.title')} — ${t('shell.pro.cta')}` : undefined}
        >
          {collapsed ? (
            <span className="rounded-md bg-[#9178E6] px-1.5 py-0.5 text-[8px] font-black text-[#090c18]">
              PRO
            </span>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <span className="rounded-md bg-[#9178E6] px-1.5 py-0.5 text-[8px] font-black text-[#090c18]">
                  PRO
                </span>
                <span className="text-[11.5px] font-semibold text-white/85">
                  {t('shell.pro.title')}
                </span>
                <span className="ms-auto text-[10px] text-[#B9A8FF]/70 transition group-hover:text-[#CFC9FF]">
                  {t('shell.pro.cta')}
                </span>
              </div>
              <p className="mt-1.5 text-[10.5px] leading-5 text-white/45">{t('shell.pro.blurb')}</p>
            </>
          )}
        </a>

        {profile ? (
          <div
            className={`mt-3 flex items-center gap-2.5 ${
              collapsed ? 'justify-center px-0' : 'px-1'
            }`}
          >
            <span
              className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#9178E6] to-[#5B3FC7] text-[11px] font-black text-white"
              title={
                collapsed
                  ? `${displayName}${profile.email ? ` — ${profile.email}` : ''}`
                  : undefined
              }
            >
              {initial}
            </span>
            {collapsed ? null : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-white/80">{displayName}</p>
                  <p className="truncate text-[10px] text-white/40">
                    {profile.email ?? 'حسابك متصل بدارس'}
                  </p>
                </div>
                <span
                  className="size-1.5 shrink-0 rounded-full bg-[#00C386]"
                  title="متصل"
                  aria-hidden
                />
              </>
            )}
          </div>
        ) : (
          <a
            href={DARSAK_LOGIN_URL}
            className={`mt-3 flex items-center gap-2.5 rounded-xl py-1.5 transition hover:bg-white/[0.04] ${
              collapsed ? 'justify-center px-0' : 'px-1'
            }`}
            title={collapsed ? t('shell.guest.hint') : undefined}
            aria-label={collapsed ? t('shell.guest.hint') : undefined}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#FB7E5B] to-[#E879C0] text-[11px] font-black text-white">
              ض
            </span>
            {collapsed ? null : (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-white/80">
                  {t('shell.guest.name')}
                </p>
                <p className="truncate text-[10px] text-white/40">{t('shell.guest.hint')}</p>
              </div>
            )}
          </a>
        )}
      </div>
    </aside>
  );
}
