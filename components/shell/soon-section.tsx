'use client';

/**
 * Shared empty-state section: the Knowunity-style placeholder — a big soft
 * icon, a bold headline, one honest sentence, and a disabled call-to-action
 * labeled "soon". Never pretends a feature exists.
 */
import { AppShell } from '@/components/shell/app-shell';
import { useI18n } from '@/lib/hooks/use-i18n';

export function SoonSection({
  navKey,
  icon,
  headlineKey,
  subKey,
  ctaKey,
}: {
  navKey: string;
  icon: React.ReactNode;
  headlineKey: string;
  subKey: string;
  ctaKey: string;
}) {
  const { t } = useI18n();

  return (
    <AppShell title={t(`shell.nav.${navKey}`)}>
      <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-6 pb-10 text-center">
        <span className="grid size-28 place-items-center rounded-[2rem] bg-[#9178E6]/12 text-[#9178E6]">
          {icon}
        </span>
        <h2 className="mt-7 text-[clamp(1.4rem,2.6vw,1.9rem)] font-black text-white">
          {t(headlineKey)}
        </h2>
        <p className="mt-3 max-w-md text-[13.5px] leading-7 text-white/50">{t(subKey)}</p>
        <button
          type="button"
          disabled
          title={t('shell.soon')}
          className="mt-7 cursor-not-allowed rounded-full bg-white/[0.08] px-6 py-2.5 text-[13px] font-bold text-white/50"
        >
          {t(ctaKey)} · {t('shell.soon')}
        </button>
      </div>
    </AppShell>
  );
}
