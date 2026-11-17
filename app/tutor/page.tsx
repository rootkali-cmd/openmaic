'use client';

/**
 * دروسي — the tutor home. A chat-style greeting with one ask bar; whatever
 * the student types goes straight into a whiteboard lesson, so the product's
 * standout feature is one keystroke away. Tool chips below are honest: only
 * the board is live today, the rest are labeled as coming soon.
 */
import {
  ArrowUp,
  BookOpen,
  FileText,
  GraduationCap,
  ImagePlus,
  ListChecks,
  Youtube,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { useI18n } from '@/lib/hooks/use-i18n';

export default function TutorPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [value, setValue] = useState('');

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return t('tutor.greetingMorning');
    if (hour >= 17 || hour < 5) return t('tutor.greetingEvening');
    return t('tutor.greeting');
    // Re-greet when the language changes; hour is read at render time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const ask = useCallback(() => {
    const question = value.trim();
    if (!question) return;
    router.push(`/whiteboard?q=${encodeURIComponent(question)}`);
  }, [value, router]);

  const chips: { key: string; icon: ReactNode; disabled?: boolean }[] = [
    { key: 'tutor.boardChip', icon: <GraduationCap className="size-4 text-[#9178E6]" aria-hidden /> },
    { key: 'tutor.upload', icon: <ImagePlus className="size-4 text-[#5FA0FC]" aria-hidden />, disabled: true },
    { key: 'tutor.youtube', icon: <Youtube className="size-4 text-[#FB7E5B]" aria-hidden />, disabled: true },
    { key: 'tutor.notes', icon: <FileText className="size-4 text-[#00C386]" aria-hidden />, disabled: true },
    { key: 'tutor.quiz', icon: <ListChecks className="size-4 text-[#E879C0]" aria-hidden />, disabled: true },
    { key: 'tutor.flashcards', icon: <BookOpen className="size-4 text-[#FFD84D]" aria-hidden />, disabled: true },
  ];

  return (
    <AppShell title={t('shell.nav.tutor')}>
      <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-6 pb-10">
        <div className="flex w-full max-w-[720px] flex-col items-center text-center">
          <span className="mb-6 grid size-14 place-items-center rounded-3xl bg-gradient-to-br from-[#9178E6] via-[#722ED1] to-[#5B3FC7] shadow-[0_18px_44px_-20px_rgba(114,46,209,0.9)]">
            <svg viewBox="0 0 48 48" className="size-8 text-white" aria-hidden>
              <path d="M24 11 8 18l16 7 16-7-16-7Z" fill="currentColor" opacity="0.95" />
              <path
                d="M15 22.5V29c0 3.2 4 5.5 9 5.5s9-2.3 9-5.5v-6.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                opacity="0.75"
              />
            </svg>
          </span>

          <h2 className="text-[clamp(1.5rem,3vw,2.1rem)] font-black leading-snug text-white">
            {greeting}
          </h2>
          <p className="mt-2.5 max-w-md text-[13.5px] leading-7 text-white/50">
            {t('tutor.subtitle')}
          </p>

          <div className="mt-8 w-full">
            <div className="flex items-end gap-2 rounded-[26px] border border-white/10 bg-[#12141F]/95 p-2.5 shadow-[0_26px_60px_-28px_rgba(0,0,0,0.95)] backdrop-blur-xl transition focus-within:border-[#9178E6]/50">
              <textarea
                rows={1}
                value={value}
                onChange={(event) => setValue(event.target.value.slice(0, 600))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    ask();
                  }
                }}
                placeholder={t('tutor.placeholder')}
                aria-label={t('tutor.placeholder')}
                className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-[14px] leading-6 text-white outline-none placeholder:text-white/35"
              />
              <button
                type="button"
                onClick={ask}
                disabled={!value.trim()}
                aria-label={t('tutor.send')}
                title={t('tutor.send')}
                className="grid size-9 shrink-0 place-items-center rounded-full bg-[#9178E6] text-white transition hover:bg-[#7C63D8] disabled:bg-white/[0.08] disabled:text-white/30"
              >
                <ArrowUp className="size-4.5" aria-hidden />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {chips.map((chip) => {
                const label = t(chip.key);
                const active = !chip.disabled;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    disabled={chip.disabled}
                    onClick={active ? ask : undefined}
                    title={active ? label : `${label} · ${t('shell.soon')}`}
                    className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] font-semibold transition ${
                      active
                        ? 'border-[#9178E6]/40 bg-[#9178E6]/12 text-white hover:border-[#9178E6]/70 hover:bg-[#9178E6]/20'
                        : 'border-white/[0.08] bg-white/[0.04] text-white/45'
                    }`}
                  >
                    {chip.icon}
                    {label}
                    {chip.disabled ? (
                      <span className="rounded-full bg-white/[0.07] px-1.5 py-0.5 text-[9px] text-white/40">
                        {t('shell.soon')}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-[10.5px] text-white/30">{t('tutor.soonHint')}</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
