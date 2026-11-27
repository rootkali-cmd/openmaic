'use client';

/**
 * Focus timer — a floating dial in the shell.
 *
 * Knowunity's study timer opens a small panel where the length is chosen
 * before starting; this is the same interaction with our own minimum: 10
 * minutes instead of their 5. The countdown survives navigation and reloads
 * (localStorage), finishes with a toast, and every completed session is
 * recorded for the personal progress view.
 */
import { Pause, Play, RotateCcw, Square, Timer } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useI18n } from '@/lib/hooks/use-i18n';
import { addFocusSession } from '@/lib/study-data';
import { playTimerChime } from '@/lib/timer-chime';

const STORAGE_KEY = 'darsak-focus-timer-v1';
const POS_STORAGE_KEY = 'darsak-focus-timer-pos-v1';
export const FOCUS_OPEN_EVENT = 'darsak-focus-open';
const MIN_MINUTES = 10;
const MAX_MINUTES = 180;
const DEFAULT_MINUTES = 25;
const PRESETS = [10, 15, 20, 25, 30, 45, 60];

interface TimerState {
  durationMs: number;
  remainingMs: number;
  /** Wall-clock deadline while running; null when idle/paused. */
  endsAt: number | null;
  running: boolean;
}

function minutesToState(minutes: number): TimerState {
  const ms = minutes * 60_000;
  return { durationMs: ms, remainingMs: ms, endsAt: null, running: false };
}

const DEFAULT_STATE = minutesToState(DEFAULT_MINUTES);

function isTimerState(value: unknown): value is TimerState {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.durationMs === 'number' &&
    typeof record.remainingMs === 'number' &&
    (record.endsAt === null || typeof record.endsAt === 'number') &&
    typeof record.running === 'boolean'
  );
}

function readState(): TimerState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isTimerState(parsed) ? parsed : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

function persist(state: TimerState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — this visit still keeps the countdown */
  }
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Compact duration for the floating dial: `1h30`, `25m`, `45s`. Latin unit
 * letters keep the numeric line readable beside the countdown.
 */
function formatShort(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, '0')}`;
  if (minutes > 0) return `${minutes}m`;
  return `${total % 60}s`;
}

export function StudyTimer() {
  const { t } = useI18n();
  const [state, setState] = useState<TimerState>(DEFAULT_STATE);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);
  // Draggable: position the floating dial anywhere; null = default corner.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    moved: false,
    id: null as number | null,
  });

  const clampPos = (x: number, y: number) => {
    const w = wrapperRef.current?.offsetWidth ?? 56;
    const h = wrapperRef.current?.offsetHeight ?? 56;
    const maxX = Math.max(4, window.innerWidth - w - 4);
    const maxY = Math.max(4, window.innerHeight - h - 4);
    return { x: Math.min(Math.max(4, x), maxX), y: Math.min(Math.max(4, y), maxY) };
  };

  // Hydrate after mount so the server and the first client render agree.
  useEffect(() => {
    const stored = readState();
    const remaining =
      stored.running && stored.endsAt
        ? Math.max(0, stored.endsAt - Date.now())
        : stored.remainingMs;
    setState({ ...stored, remainingMs: remaining });
    setNow(Date.now());
    setHydrated(true);
    try {
      const rawPos = window.localStorage.getItem(POS_STORAGE_KEY);
      if (rawPos) {
        const p = JSON.parse(rawPos) as { x?: number; y?: number };
        if (typeof p.x === 'number' && typeof p.y === 'number') setPos(clampPos(p.x, p.y));
      }
    } catch {
      /* ignore corrupt position */
    }
  }, []);

  // A running session counts down from its deadline, not from tick counts,
  // so a throttled background tab still finishes on time.
  useEffect(() => {
    if (!state.running || !state.endsAt) return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (state.endsAt && current >= state.endsAt && !completedRef.current) {
        completedRef.current = true;
        const done: TimerState = {
          ...state,
          running: false,
          endsAt: null,
          remainingMs: 0,
        };
        setState(done);
        persist(done);
        addFocusSession({
          minutes: Math.round(state.durationMs / 60_000),
          completed: true,
        });
        // A soft chime marks the end, alongside the toast.
        playTimerChime();
        toast.success(t('shell.focus.done'));
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [state, t]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Other pages (e.g. the progress view) can open the panel.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(FOCUS_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(FOCUS_OPEN_EVENT, onOpen);
  }, []);

  const remaining =
    state.running && state.endsAt ? Math.max(0, state.endsAt - now) : state.remainingMs;
  const finished = remaining <= 0 && state.remainingMs === 0;
  const started = !state.running && state.remainingMs < state.durationMs && !finished;
  const progress = 1 - remaining / Math.max(1, state.durationMs);
  const minutes = Math.round(state.durationMs / 60_000);

  const update = (next: TimerState) => {
    completedRef.current = false;
    setState(next);
    persist(next);
    // eslint-disable-next-line react-hooks/purity -- wall-clock read in an event handler
    setNow(Date.now());
  };

  const chooseMinutes = (value: number) => {
    const clamped = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, value));
    update(minutesToState(clamped));
  };

  const start = () => {
    const ms = state.remainingMs > 0 ? state.remainingMs : state.durationMs;
    // eslint-disable-next-line react-hooks/purity -- wall-clock read in an event handler
    update({ ...state, remainingMs: ms, endsAt: Date.now() + ms, running: true });
  };

  const pause = () => {
    // eslint-disable-next-line react-hooks/purity -- wall-clock read in an event handler
    const ms = state.endsAt ? Math.max(0, state.endsAt - Date.now()) : state.remainingMs;
    update({ ...state, remainingMs: ms, endsAt: null, running: false });
  };

  const reset = () => {
    update({ ...state, remainingMs: state.durationMs, endsAt: null, running: false });
  };

  const finishEarly = () => {
    const elapsed = Math.max(1, Math.round((state.durationMs - remaining) / 60_000));
    addFocusSession({ minutes: elapsed, completed: false });
    toast.info(t('shell.focus.stopped'));
    reset();
  };

  // The dial fills with the session as it elapses; idle it sits as a quiet
  // timer icon so it never competes with the page.
  const dialProgress = Math.min(1, Math.max(0, progress));
  const showTime = hydrated && (state.running || started || finished);

  const onDragStart = (event: ReactPointerEvent) => {
    if (open) return; // drag the collapsed dial; the panel stays put
    const w = wrapperRef.current;
    if (!w) return;
    const r = w.getBoundingClientRect();
    drag.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      origX: r.left,
      origY: r.top,
      moved: false,
      id: event.pointerId,
    };
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      /* noop */
    }
  };
  const onDragMove = (event: ReactPointerEvent) => {
    if (!drag.current.active) return;
    const dx = event.clientX - drag.current.startX;
    const dy = event.clientY - drag.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.current.moved = true;
    if (drag.current.moved) {
      event.preventDefault();
      setPos(clampPos(drag.current.origX + dx, drag.current.origY + dy));
    }
  };
  const onDragEnd = (event: ReactPointerEvent) => {
    if (!drag.current.active) return;
    const wasMoved = drag.current.moved;
    drag.current.active = false;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(
        drag.current.id ?? event.pointerId,
      );
    } catch {
      /* noop */
    }
    if (!wasMoved) {
      setOpen((v) => !v);
      return;
    }
    setPos((cur) => {
      const next = cur ?? clampPos(drag.current.origX, drag.current.origY);
      try {
        window.localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  };

  return (
    // Clickable + draggable to anywhere; remembers position. Default corner otherwise.
    <div
      ref={wrapperRef}
      className="fixed bottom-[8.5rem] end-4 z-40 md:bottom-6 md:end-6"
      style={
        pos
          ? {
              left: pos.x,
              top: pos.y,
              right: 'auto',
              bottom: 'auto',
              insetInlineStart: 'auto',
              insetInlineEnd: 'auto',
            }
          : undefined
      }
    >
      {open ? (
        <div
          role="dialog"
          aria-label={t('shell.focus.title')}
          className="absolute bottom-[calc(100%+12px)] end-0 z-50 w-[min(320px,calc(100vw-24px))] rounded-2xl border border-white/10 bg-[#12141f] p-4 text-start shadow-[0_30px_80px_-30px_rgba(0,0,0,0.95)]"
        >
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-[#9178E6]/15 text-[#B9A8FF]">
              <Timer className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-bold text-white">{t('shell.focus.title')}</p>
              <p className="text-[10px] text-white/40">{t('shell.focus.sub')}</p>
            </div>
          </div>

          <div className="mt-4 text-center">
            <p className="text-[34px] font-black tabular-nums leading-none text-white" dir="ltr">
              {formatClock(remaining)}
            </p>
            <p className="mt-1 text-[10px] text-white/40">
              {finished
                ? t('shell.focus.done')
                : state.running
                  ? t('shell.focus.remaining')
                  : t('shell.focus.ready')}
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${
                  state.running ? 'bg-[#00C386]' : 'bg-[#9178E6]'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
              />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex flex-wrap justify-center gap-1.5">
              {PRESETS.map((preset) => {
                const selected = minutes === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    disabled={state.running}
                    onClick={() => chooseMinutes(preset)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums transition disabled:opacity-40 ${
                      selected
                        ? 'bg-[#9178E6] text-white'
                        : 'bg-white/[0.05] text-white/55 hover:bg-white/[0.09] hover:text-white'
                    }`}
                  >
                    {preset} {t('shell.focus.minuteShort')}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                disabled={state.running}
                onClick={() => chooseMinutes(minutes - 5)}
                aria-label={t('shell.focus.less')}
                className="grid size-7 place-items-center rounded-full bg-white/[0.06] text-[13px] font-bold text-white/65 transition hover:bg-white/[0.12] disabled:opacity-30"
              >
                −
              </button>
              <span className="min-w-[86px] text-center text-[11px] font-semibold text-white/60">
                {minutes} {t('shell.focus.minutes')}
              </span>
              <button
                type="button"
                disabled={state.running}
                onClick={() => chooseMinutes(minutes + 5)}
                aria-label={t('shell.focus.more')}
                className="grid size-7 place-items-center rounded-full bg-white/[0.06] text-[13px] font-bold text-white/65 transition hover:bg-white/[0.12] disabled:opacity-30"
              >
                +
              </button>
            </div>
            <p className="mt-2 text-center text-[9.5px] text-white/30">
              {t('shell.focus.minHint')}
            </p>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {state.running ? (
              <button
                type="button"
                onClick={pause}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#00C386] text-[12px] font-bold text-[#06251a] transition hover:bg-[#23d69c]"
              >
                <Pause className="size-3.5" aria-hidden />
                {t('shell.focus.pause')}
              </button>
            ) : (
              <button
                type="button"
                onClick={start}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#9178E6] text-[12px] font-bold text-white transition hover:bg-[#7C63D8]"
              >
                <Play className="size-3.5" aria-hidden />
                {started ? t('shell.focus.resume') : t('shell.focus.start')}
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              title={t('shell.focus.reset')}
              aria-label={t('shell.focus.reset')}
              className="grid size-9 place-items-center rounded-full bg-white/[0.06] text-white/55 transition hover:bg-white/[0.12] hover:text-white"
            >
              <RotateCcw className="size-4" aria-hidden />
            </button>
            {started || state.running ? (
              <button
                type="button"
                onClick={finishEarly}
                title={t('shell.focus.finish')}
                aria-label={t('shell.focus.finish')}
                className="grid size-9 place-items-center rounded-full bg-white/[0.06] text-white/55 transition hover:bg-white/[0.12] hover:text-white"
              >
                <Square className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('shell.focus.title')}
        title={t('shell.focus.title') + ' — اسحبها لأي مكان'}
        style={{ touchAction: 'none' }}
        className={`group relative grid size-14 cursor-grab place-items-center rounded-full border text-white shadow-[0_18px_44px_-16px_rgba(0,0,0,0.85)] backdrop-blur transition hover:scale-[1.04] active:cursor-grabbing active:scale-95 ${
          state.running ? 'border-[#00C386]/40 bg-[#0E1A17]/90' : 'border-white/10 bg-[#12141f]/90'
        }`}
      >
        {/* Elapsed progress ring — conic so it needs no SVG maths. */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(${
              state.running ? '#00C386' : '#9178E6'
            } ${dialProgress * 360}deg, rgba(255,255,255,0.07) 0)`,
            opacity: showTime ? 1 : 0,
            transition: 'opacity 200ms',
          }}
        />
        <span
          aria-hidden
          className={`absolute inset-[3px] rounded-full ${
            state.running ? 'bg-[#0C1512]' : 'bg-[#12141f]'
          }`}
        />
        <span className="relative flex flex-col items-center leading-none">
          {showTime ? (
            <span
              dir="ltr"
              className={`text-[12.5px] font-black tabular-nums ${
                state.running ? 'text-[#7BE8BE]' : 'text-white/80'
              }`}
            >
              {formatShort(remaining)}
            </span>
          ) : (
            <Timer
              className="size-5 text-[#B9A8FF] transition group-hover:text-white darsak-timer-wiggle"
              aria-hidden
            />
          )}
        </span>
        {state.running ? (
          <span
            className="absolute -top-0.5 -end-0.5 size-2.5 animate-pulse rounded-full bg-[#00C386] ring-2 ring-[#090c18]"
            aria-hidden
          />
        ) : null}
      </button>
    </div>
  );
}
