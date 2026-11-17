'use client';

/**
 * البحث — search section. The field and trend chips render today; actual
 * indexed search lands with the library feature, so submitting shows an
 * honest "soon" note instead of fake results.
 */
import { Search, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { AppShell } from '@/components/shell/app-shell';
import { useI18n } from '@/lib/hooks/use-i18n';

export default function SearchPage() {
  const { t } = useI18n();
  const [value, setValue] = useState('');

  const trends = ['sections.search.trend1', 'sections.search.trend2', 'sections.search.trend3', 'sections.search.trend4'];

  const submit = () => {
    if (!value.trim()) return;
    toast.info(t('shell.soon'));
  };

  return (
    <AppShell title={t('sections.search.title')}>
      <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-6 pb-10">
        <div className="w-full max-w-[640px]">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2.5 rounded-2xl border border-white/10 bg-[#12141F] px-4 py-3 transition focus-within:border-[#9178E6]/50">
              <Search className="size-4.5 shrink-0 text-white/40" aria-hidden />
              <input
                value={value}
                onChange={(event) => setValue(event.target.value.slice(0, 200))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submit();
                }}
                placeholder={t('sections.search.placeholder')}
                aria-label={t('sections.search.title')}
                className="w-full bg-transparent text-[14px] text-white outline-none placeholder:text-white/35"
              />
            </div>
            <button
              type="button"
              disabled
              aria-label={t('sections.search.filter')}
              className="grid size-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-[#12141F] text-white/40"
            >
              <SlidersHorizontal className="size-4.5" aria-hidden />
            </button>
          </div>

          <p className="mt-6 text-center text-[11px] font-semibold text-white/35">
            {t('sections.search.trending')}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {trends.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setValue(t(key));
                  toast.info(t('shell.soon'));
                }}
                className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-[12px] font-semibold text-white/60 transition hover:border-[#9178E6]/40 hover:text-white"
              >
                <TrendingUp className="size-3.5 text-[#00C386]" aria-hidden />
                {t(key)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
