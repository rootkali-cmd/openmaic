'use client';

/**
 * Shared empty-state section, styled after the reference's in-app sections:
 * a large violet glyph, a bold headline, one honest sentence, and a white
 * pill call-to-action. The CTA is visible (so the layout reads complete) but
 * only ever shows a "coming soon" toast — it never pretends a feature works.
 */
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { AppShell } from '@/components/shell/app-shell';
import { useI18n } from '@/lib/hooks/use-i18n';

export function SoonSection({
  navKey,
  icon,
  headlineKey,
  subKey,
  ctaKey,
  actionKey,
  children,
  variant = 'centered',
}: {
  navKey: string;
  icon?: React.ReactNode;
  headlineKey: string;
  subKey: string;
  ctaKey: string;
  /** Optional white pill in the section top bar (Create Plan / Generate test). */
  actionKey?: string;
  /** Optional extra block above the headline (e.g. the league trophies). */
  children?: React.ReactNode;
  variant?: 'centered' | 'card';
}) {
  const { t } = useI18n();
  const soon = () => toast.info(t('shell.soon'));

  const action = actionKey ? (
    <button
      type="button"
      onClick={soon}
      title={t('shell.soon')}
      className="hidden items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[12px] font-bold text-[#0B0D16] transition hover:bg-white/90 sm:flex"
    >
      <Plus className="size-3.5" aria-hidden />
      {t(actionKey)}
    </button>
  ) : undefined;

  const body = (
    <>
      {icon ? (
        <span className="grid place-items-center text-[#9178E6] [&>svg]:size-20 [&>svg]:stroke-[1.7]">
          {icon}
        </span>
      ) : null}
      {children}
      <h2 className="mt-6 text-[clamp(1.5rem,2.8vw,2rem)] font-black text-white">
        {t(headlineKey)}
      </h2>
      <p className="mt-3 max-w-md text-[13.5px] leading-7 text-white/50">{t(subKey)}</p>
      <button
        type="button"
        onClick={soon}
        title={t('shell.soon')}
        className="mt-7 rounded-full bg-white px-6 py-2.5 text-[13px] font-bold text-[#0B0D16] transition hover:bg-white/90"
      >
        {t(ctaKey)}
      </button>
    </>
  );

  return (
    <AppShell title={t(`shell.nav.${navKey}`)} actions={action}>
      <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-6 pb-10 text-center">
        {variant === 'card' ? (
          <div className="flex w-full max-w-[420px] flex-col items-center rounded-[28px] border border-white/[0.06] bg-white/[0.035] px-8 py-10 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.9)]">
            {body}
          </div>
        ) : (
          <div className="flex flex-col items-center">{body}</div>
        )}
      </div>
    </AppShell>
  );
}

/** Three league trophies: the current one lit, the next two muted. */
export function LeagueTrophies() {
  return (
    <div className="flex items-center gap-4">
      {[0, 1, 2].map((index) => (
        <svg
          key={index}
          viewBox="0 0 24 24"
          className={`size-16 ${index === 0 ? 'text-[#FB7E5B]' : 'text-white/15'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
          <path d="M7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3" />
        </svg>
      ))}
    </div>
  );
}
