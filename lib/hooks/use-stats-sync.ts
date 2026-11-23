'use client';

import { useEffect, useRef } from 'react';

import { getLessons, getQuizAttempts, STUDY_DATA_EVENT, totalFocusMinutes } from '@/lib/study-data';

/**
 * Pushes the student's real local counters to the shared leaderboard.
 *
 * Only signed-in students sync (the host route ignores guests). We read the
 * signed-in flag once from `/api/identity/me`, then re-push whenever the local
 * study stores change (debounced), so the ranking tracks genuine activity
 * without a manual refresh.
 */
export function useStatsSync(): void {
  const signedInRef = useRef<boolean | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const counters = () => {
      const attempts = getQuizAttempts();
      return {
        lessons: getLessons().length,
        quizzes: attempts.length,
        focusMinutes: totalFocusMinutes(),
        correct: attempts.reduce((sum, item) => sum + item.correct, 0),
        total: attempts.reduce((sum, item) => sum + item.total, 0),
      };
    };

    const push = () => {
      if (signedInRef.current !== true) return;
      void fetch('/api/host/stats', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(counters()),
        cache: 'no-store',
      }).catch(() => undefined);
    };

    const schedule = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(push, 2500);
    };

    void fetch('/api/identity/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { signedIn?: boolean } | null) => {
        if (cancelled) return;
        signedInRef.current = Boolean(data?.signedIn);
        if (signedInRef.current) schedule();
      })
      .catch(() => undefined);

    window.addEventListener(STUDY_DATA_EVENT, schedule);
    window.addEventListener('storage', schedule);
    return () => {
      cancelled = true;
      window.removeEventListener(STUDY_DATA_EVENT, schedule);
      window.removeEventListener('storage', schedule);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);
}
