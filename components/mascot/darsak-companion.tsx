'use client';

/**
 * The floating Darsak companion: every so often the mascot slides in from
 * the screen edge, smiles and leaves one short motivational line, then slides
 * back out. It is decorative and dismissible — it never blocks the page and
 * pauses when the student asks it to.
 */
import { X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { DarsakMascot } from './darsak-mascot';

const MESSAGES = [
  'خطوة صغيرة النهارده أحسن من خطة كبيرة بكرة.',
  'ذاكر ٢٥ دقيقة وخد بريك ٥ — دماغك هتشكرك.',
  'سؤال واحد كفاية تبدأ بيه. يلا؟',
  'إنت أقرب مما تتخيل. كمّل!',
  'كل درس بتخلصه بيفرق. صح؟',
  'لو تعبت، خد نفس عميق وارجع لسؤال واحد بس.',
  'المذاكرة مش سباق — إنت بتتقدم كل يوم.',
  'التركيز مهارة، وكل مرة بتتمرن عليها بتقوى.',
];

// One short line every three minutes, not "back to back". The full cycle is
// visible + gap, so GAP + VISIBLE = 3 min total between reveals.
const FIRST_DELAY_MS = 10_000;
const VISIBLE_MS = 8_000;
const GAP_MS = 172_000;

export function DarsakCompanion() {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState(MESSAGES[0]);
  const [dir, setDir] = useState<'rtl' | 'ltr'>('rtl');
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const index = useRef(0);
  // Self-scheduling loop: the timeout callback needs to re-arm itself, but a
  // `useCallback` that calls itself is rejected by the hooks linter. The ref
  // holds the latest scheduler and is filled in after it is created.
  const scheduleRef = useRef<(delay: number) => void>(() => {});

  const scheduleNext = useCallback((delay: number) => {
    if (showTimer.current !== null) window.clearTimeout(showTimer.current);
    showTimer.current = window.setTimeout(() => {
      // Read the live document direction at reveal time: the language switcher
      // swaps `dir` on <html> without remounting the shell.
      setDir(document.documentElement.dir === 'ltr' ? 'ltr' : 'rtl');
      setMessage(MESSAGES[index.current % MESSAGES.length] ?? MESSAGES[0]);
      index.current += 1;
      setVisible(true);
      hideTimer.current = window.setTimeout(() => {
        setVisible(false);
        scheduleRef.current(GAP_MS);
      }, VISIBLE_MS);
    }, delay);
  }, []);

  useEffect(() => {
    scheduleRef.current = scheduleNext;
    scheduleNext(FIRST_DELAY_MS);
    return () => {
      if (showTimer.current !== null) window.clearTimeout(showTimer.current);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    };
  }, [scheduleNext]);

  const dismiss = () => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    setVisible(false);
    scheduleNext(GAP_MS);
  };

  // In RTL the companion lives on the left edge, so it enters from that side.
  const offscreenX = dir === 'rtl' ? -160 : 160;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={reduced ? { opacity: 0 } : { x: offscreenX, opacity: 0 }}
          animate={reduced ? { opacity: 1 } : { x: 0, opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { x: offscreenX, opacity: 0 }}
          transition={reduced ? { duration: 0.2 } : { type: 'spring', stiffness: 210, damping: 24 }}
          className="pointer-events-none fixed top-[64px] end-4 z-40 flex items-start gap-1.5 md:end-6"
          role="status"
          aria-live="polite"
        >
          <div className="pointer-events-auto relative max-w-[228px] rounded-2xl rounded-ee-md border border-[#9178E6]/30 bg-[#12141f]/95 px-3.5 py-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur">
            <button
              type="button"
              onClick={dismiss}
              aria-label="اقفل رسالة دارس"
              className="absolute -top-1.5 -end-1.5 grid size-5 place-items-center rounded-full border border-white/10 bg-[#1d2030] text-white/50 transition hover:text-white"
            >
              <X className="size-3" aria-hidden />
            </button>
            <p className="text-[11.5px] font-medium leading-6 text-white/85">{message}</p>
          </div>
          <DarsakMascot className="size-14 shrink-0 drop-shadow-[0_12px_26px_rgba(145,120,230,0.35)]" />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
