/**
 * A gentle completion chime for the study timer, synthesised with WebAudio so
 * no audio asset ships. Best-effort: if the browser has no WebAudio, or
 * autoplay policy has the context suspended and can't resume it, it silently
 * does nothing — a missing sound must never break the timer itself.
 */

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx ??= new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** Play a soft rising three-note chime (A5 · D6 · G6). */
export function playTimerChime(): void {
  const audio = audioContext();
  if (!audio) return;

  try {
    if (audio.state === 'suspended') void audio.resume();

    const now = audio.currentTime;
    // A major arpeggio reads as "done", not as an alarm.
    const notes = [880, 1174.66, 1567.98];
    notes.forEach((freq, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const start = now + i * 0.16;
      const dur = 0.5;
      // Short attack + exponential release; never click at the edges.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
  } catch {
    /* best effort */
  }
}
