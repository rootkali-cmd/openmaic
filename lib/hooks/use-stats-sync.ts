'use client';

import { useEffect, useRef } from 'react';

import {
  getLessons,
  getQuizAttempts,
  isStatsSyncDisabled,
  STATS_OPT_OUT_KEY,
  STATS_SYNC_EVENT,
  STUDY_DATA_EVENT,
  totalFocusMinutes,
} from '@/lib/study-data';

/**
 * Pushes the student's real local counters to the shared leaderboard.
 *
 * Only signed-in students sync (the host route ignores guests), and only
 * while they participate: the ranking opt-out stops every push and removes
 * the counters already synced. We read the signed-in flag once from
 * `/api/identity/me`, then re-push whenever the local study stores change
 * (debounced), so the ranking tracks genuine activity without a manual
 * refresh.
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
      if (signedInRef.current !== true || isStatsSyncDisabled()) return;
      void fetch('/api/host/stats', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(counters()),
        cache: 'no-store',
      }).catch(() => undefined);
    };

    const remove = () => {
      if (signedInRef.current !== true) return;
      void fetch('/api/host/stats', { method: 'DELETE', cache: 'no-store' }).catch(() => undefined);
    };

    const clearPending = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };

    const schedule = () => {
      if (isStatsSyncDisabled()) return;
      clearPending();
      timerRef.current = window.setTimeout(push, 2500);
    };

    // The student toggled participation: stop syncing and erase the synced
    // counters, or resume and push the real ones right away.
    const onSyncToggle = () => {
      clearPending();
      if (isStatsSyncDisabled()) remove();
      else push();
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === STATS_OPT_OUT_KEY) onSyncToggle();
      else schedule();
    };

    void fetch('/api/identity/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { signedIn?: boolean } | null) => {
        if (cancelled) return;
        signedInRef.current = Boolean(data?.signedIn);
        if (!signedInRef.current) return;
        // Re-assert the opt-out on load so a removal that failed earlier
        // (offline toggle) still converges; otherwise start syncing.
        if (isStatsSyncDisabled()) remove();
        else schedule();
      })
      .catch(() => undefined);

    window.addEventListener(STUDY_DATA_EVENT, schedule);
    window.addEventListener('storage', onStorage);
    window.addEventListener(STATS_SYNC_EVENT, onSyncToggle);
    return () => {
      cancelled = true;
      window.removeEventListener(STUDY_DATA_EVENT, schedule);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(STATS_SYNC_EVENT, onSyncToggle);
      clearPending();
    };
  }, []);
}
