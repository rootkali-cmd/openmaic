'use client';

/**
 * Lesson status cluster — sits in the shell top bar while a lesson runs:
 * what the teacher is doing right now, a real elapsed clock, and stop.
 */
import { Square } from 'lucide-react';
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

export function LessonStatus() {
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
    <>
      {title ? (
        <span className="hidden max-w-[220px] truncate text-[12px] text-white/45 md:block">
          {title}
        </span>
      ) : null}
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
    </>
  );
}
