/**
 * Speech generation for the whiteboard teacher.
 *
 * Wraps the Web Speech API behind a tiny adapter so the lesson player can
 * treat "speaking" as a single call with a guaranteed end callback. When the
 * browser has no Arabic voice (or TTS is unavailable), a word-rate fallback
 * timer keeps the lesson pacing instead of stalling — the board must keep
 * moving even in a silent tab.
 *
 * Hosted Arabic TTS (Amazon Polly, tier-routed) can replace `speak` later
 * without touching the player.
 */

/** Rough Arabic speaking rate: ~2.7 chars/sec, plus sentence padding. */
export function estimateSpeechMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  return Math.max(900, words * 360 + chars * 45 + 500);
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickArabicVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const arabic = voices.filter((v) => v.lang.toLowerCase().startsWith('ar'));
  if (arabic.length === 0) return null;
  // Prefer a natural/local-sounding Arabic voice over a machine default.
  return (
    arabic.find((v) => /google|natural|premium|enhanced/i.test(v.name)) ?? arabic[0]
  );
}

interface SpeakHandle {
  cancel: () => void;
}

let activeHandle: SpeakHandle | null = null;

/** Speak `text`; `onEnd` fires exactly once — on finish, error or cancel. */
export function speak(
  text: string,
  opts: { onEnd?: () => void; rate?: number; volume?: number } = {},
): SpeakHandle {
  const { onEnd, rate = 1.0, volume = 1.0 } = opts;
  let settled = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;
  let kickoffTimer: ReturnType<typeof setTimeout> | null = null;

  const finish = () => {
    if (settled) return;
    settled = true;
    if (fallbackTimer) clearTimeout(fallbackTimer);
    if (safetyTimer) clearTimeout(safetyTimer);
    if (kickoffTimer) clearTimeout(kickoffTimer);
    fallbackTimer = null;
    safetyTimer = null;
    kickoffTimer = null;
    if (activeHandle === handle) activeHandle = null;
    onEnd?.();
  };

  const startFallback = (delayMs: number) => {
    if (settled || fallbackTimer) return;
    fallbackTimer = setTimeout(finish, delayMs);
  };

  const handle: SpeakHandle = {
    cancel: () => {
      if (settled) return;
      settled = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (safetyTimer) clearTimeout(safetyTimer);
      if (kickoffTimer) clearTimeout(kickoffTimer);
      fallbackTimer = null;
      safetyTimer = null;
      kickoffTimer = null;
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* not supported */
      }
      if (activeHandle === handle) activeHandle = null;
      // A cancel is a deliberate stop: do NOT call onEnd (the player already
      // knows it cancelled) — mark settled so late utterance events are no-ops.
    },
  };

  // Any previous utterance is superseded. Chrome is known to drop a speak()
  // issued in the same tick as a cancel(), so when we ARE replacing live
  // speech we wait a beat before queueing the new utterance.
  const hadPrevious = activeHandle !== null;
  activeHandle?.cancel();

  const estimate = estimateSpeechMs(text);

  if (!speechSupported()) {
    startFallback(estimate);
    activeHandle = handle;
    return handle;
  }

  const speakNow = () => {
    if (settled) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ar-SA';
      utterance.rate = rate;
      utterance.volume = Math.max(0, Math.min(1, volume));
      utterance.pitch = 1.0;
      const voice = pickArabicVoice(window.speechSynthesis.getVoices());
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }

      utterance.onend = finish;
      utterance.onerror = (event) => {
        // 'interrupted'/'canceled' are our own cancel() calls — stay silent.
        if (event.error === 'interrupted' || event.error === 'canceled') return;
        // Real failure (no voice, synthesis refused): pace with the estimate.
        startFallback(Math.min(estimate, 1200));
      };

      // Chrome occasionally drops an utterance without firing anything
      // (famously after ~15s of background tab). A safety net guarantees
      // `onEnd` always happens so the lesson can never hang.
      safetyTimer = setTimeout(() => {
        if (settled) return;
        try {
          window.speechSynthesis.cancel();
        } catch {
          /* noop */
        }
        startFallback(400);
      }, estimate + 6000);

      window.speechSynthesis.speak(utterance);
    } catch {
      startFallback(estimate);
    }
  };

  activeHandle = handle;
  if (hadPrevious) {
    kickoffTimer = setTimeout(speakNow, 60);
  } else {
    speakNow();
  }

  return handle;
}

export function pauseSpeech(): void {
  try {
    window.speechSynthesis?.pause();
  } catch {
    /* noop */
  }
}

export function resumeSpeech(): void {
  try {
    window.speechSynthesis?.resume();
  } catch {
    /* noop */
  }
}

export function cancelSpeech(): void {
  activeHandle?.cancel();
  activeHandle = null;
}