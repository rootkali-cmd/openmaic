'use client';

/**
 * Section top bar for the Darsak shell: section title on the reading start,
 * and — on the far edge — a real study timer that keeps ticking across
 * navigation. No gamified counters until a system exists behind them.
 */
import { Timer } from 'lucide-react';
import { useSyncExternalStore, type ReactNode } from 'react';

import { useI18n } from '@/lib/hooks/use-i18n';

const TIMER_KEY = 'darsak-study-timer';

function readAccumulatedMs(): number {
  try {
    const raw = window.localStorage.getItem(TIMER_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function saveAccumulatedMs(ms: number): void {
  try {
    window.localStorage.setItem(TIMER_KEY, String(Math.floor(ms)));
  } catch {
    /* storage unavailable — the timer still ticks for this visit */
  }
}

function formatElapsed(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}س ${minutes}د` : `${minutes} د`;
}

/**
 * The study timer is an external store: one module-level ticker that
 * advances a shared accumulated value every 30s, exposed to every mounted
 * top bar through useSyncExternalStore (SSR renders 0; hydration picks the
 * saved value up on the first snapshot).
 */
let currentMs = 0;
let tickerStarted = false;
const listeners = new Set<() => void>();

function ensureTicker(): void {
  if (tickerStarted || typeof window === 'undefined') return;
  tickerStarted = true;
  currentMs = readAccumulatedMs();
  window.setInterval(() => {
    currentMs = readAccumulatedMs() + 30_000;
    saveAccumulatedMs(currentMs);
    listeners.forEach((listener) => listener());
  }, 30_000);
}

function subscribe(listener: () => void): () => void {
  ensureTicker();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getTimerSnapshot(): number {
  return currentMs;
}

function useStudyTimer(): number {
  return useSyncExternalStore(subscribe, getTimerSnapshot, () => 0);
}

export function ShellTopbar({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  const { t } = useI18n();
  const timerMs = useStudyTimer();

  return (
    <header className="relative z-30 flex h-[52px] shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#0B0D16] px-5">
      <h1 className="shrink-0 text-[15px] font-bold text-white">{title}</h1>

      <div className="ms-auto flex items-center gap-2">
        {actions}
        <span
          title={t('shell.timer.title')}
          className="mono flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1.5 text-[11px] tabular-nums text-white/55 transition hover:bg-white/[0.1]"
        >
          <Timer className="size-3.5" aria-hidden />
          {formatElapsed(timerMs)}
        </span>
      </div>
    </header>
  );
}
