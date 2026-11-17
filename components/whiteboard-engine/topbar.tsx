'use client';

/**
 * Compact dark top bar: where am I, what is the teacher doing, how long has
 * this lesson been running. The clock is real elapsed time — no gamified
 * numbers that don't exist.
 */
import { ArrowRight, Square } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useI18n } from '@/lib/hooks/use-i18n';
import { usePlayerStore, type PlayerStatus } from '@/lib/whiteboard-engine/player';

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const STATUS_KEY: Record<PlayerStatus, string> = {
  idle: 'wb.status.idle',
  loading: 'wb.status.loading',
  playing: 'wb.status.playing',
  paused: 'wb.status.paused',
  done: 'wb.status.done',
};

export function Topbar() {
  const { t } = useI18n();
  const status = usePlayerStore((s) => s.status);
  const title = usePlayerStore((s) => s.title);
  const [elapsed, setElapsed] = useState(0);

  // Real wall-clock lesson timer, ticking only while something is happening.
  useEffect(() => {
    if (status !== 'playing' && status !== 'paused') return;
    const startedAt = Date.now() - elapsed;
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt), 500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only on status change
  }, [status]);

  const active = status === 'playing' || status === 'paused';

  return (
    <header className="relative z-30 flex h-[52px] shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#0B0D16] px-4">
      <Link
        href="/"
        aria-label={t('wb.back')}
        className="grid size-8 place-items-center rounded-full text-white/55 transition hover:bg-white/[0.07] hover:text-white"
      >
        <ArrowRight className="size-4" aria-hidden />
      </Link>

      <div className="flex min-w-0 items-baseline gap-2.5">
        <h1 className="shrink-0 text-[13.5px] font-bold text-white">{t('wb.title')}</h1>
        {title ? (
          <>
            <span className="text-white/20" aria-hidden>
              /
            </span>
            <span className="truncate text-[12.5px] text-white/55">{title}</span>
          </>
        ) : null}
      </div>

      <div className="ms-auto flex items-center gap-2">
        <span
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
            status === 'playing'
              ? 'bg-[#FB7E5B]/15 text-[#FFB59B]'
              : status === 'paused'
                ? 'bg-[#FFD84D]/12 text-[#FFE9A3]'
                : 'bg-white/[0.06] text-white/45'
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              status === 'playing'
                ? 'wb-live-dot bg-[#FB7E5B]'
                : status === 'paused'
                  ? 'bg-[#FFD84D]'
                  : 'bg-white/30'
            }`}
            aria-hidden
          />
          {t(STATUS_KEY[status])}
        </span>

        <span
          className={`mono rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] tabular-nums text-white/50 ${
            active ? '' : 'opacity-50'
          }`}
        >
          {formatElapsed(elapsed)}
        </span>

        {active ? (
          <button
            type="button"
            onClick={() => usePlayerStore.getState().stop()}
            aria-label={t('wb.stop')}
            title={t('wb.stop')}
            className="grid size-8 place-items-center rounded-full text-white/55 transition hover:bg-[#FB7E5B]/15 hover:text-[#FB7E5B]"
          >
            <Square className="size-3.5 fill-current" aria-hidden />
          </button>
        ) : null}
      </div>
    </header>
  );
}