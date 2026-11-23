/**
 * Lesson player — the timestamped event queue that synchronizes speech with
 * drawing.
 *
 * Beats play in order. While a beat plays, two clocks run in parallel:
 *   • the speech clock (Web Speech adapter, guaranteed `onEnd`)
 *   • the reveal clock (rAF, one draw slot every STAGGER_MS)
 * The beat advances only when BOTH are done, so the board never races ahead
 * of the teacher's voice — and never lags behind it.
 *
 * Interruption contract (spec §Teaching and Audio Synchronization):
 *   pause()   → freezes both clocks, board state untouched
 *   answer()  → splices the reply's beats directly after the current beat
 *   resume    → reply plays first, then the original lesson continues from
 *               the interrupted sentence, with every previous drawing intact
 */
import { create } from 'zustand';
import { resolveBBox, useBoardStore, type BoardElement } from './board-store';
import type { Lesson, LessonBeat } from './lesson';
import { cancelSpeech, pauseSpeech, resumeSpeech, speak } from './speech';

/** Fallback gap between two drawing reveals inside one beat. */
export const STAGGER_MS = 750;

/**
 * How long the teacher's hand takes to ink an element of this width.
 *
 * The pen sweep, the ink wipe (CSS `--wb-write-ms`) and the delay before the
 * next reveal all read this one number, so nothing can get ahead of the hand:
 * a line finishes writing, then the next one starts.
 */
export function inkDurationMs(width: number): number {
  const safe = Number.isFinite(width) ? Math.abs(width) : 0;
  return Math.round(Math.min(1500, Math.max(520, safe * 2.6)));
}

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'done';

interface PlayerState {
  status: PlayerStatus;
  queue: LessonBeat[];
  index: number;
  title: string;
  error: string | null;
  follow: boolean;
  muted: boolean;
  /** Bumped on every reveal so the camera can follow the teacher's chalk. */
  revealSeq: number;
  lastRevealedId: string | null;

  start: (lesson: Lesson, opts?: { clear?: boolean }) => void;
  answer: (lesson: Lesson) => void;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
  interrupt: () => void;
  stop: () => void;
  skip: () => void;
  flush: () => void;
  setFollow: (value: boolean) => void;
  setMuted: (value: boolean) => void;
  setLoading: () => void;

  /* internal */
  _enterBeat: (index: number) => void;
  _tick: (dt: number) => void;
  _speechEnded: () => void;
}

/** Slot bookkeeping lives outside the store: it changes every beat. */
interface PlaybackCursor {
  elapsedMs: number;
  speechEnded: boolean;
  slotsDone: boolean[];
  /** Earliest time the next undrawn slot may appear (keeps the pen honest). */
  nextSlotAt: number;
  currentHandle: { cancel: () => void } | null;
}

const cursor: PlaybackCursor = {
  elapsedMs: 0,
  speechEnded: false,
  slotsDone: [],
  nextSlotAt: 0,
  currentHandle: null,
};

/**
 * Interruption stack: one record per interrupted beat, pushed when a student
 * answer is spliced in. When playback reaches `replyEndIndex` the record is
 * popped and the original beat resumes from exactly where it stopped — the
 * sentence replays from its start, already-drawn slots stay drawn.
 * LIFO so nested interruptions (answering while an answer plays) unwind in
 * the right order.
 */
interface ResumeRecord {
  beatIndex: number;
  replyEndIndex: number;
  cursor: Omit<PlaybackCursor, 'currentHandle'>;
}

const resumeStack: ResumeRecord[] = [];

function clearResumeStack() {
  resumeStack.length = 0;
}

let rafId: number | null = null;
let lastTs = 0;

function stopLoop() {
  if (rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(rafId);
  }
  rafId = null;
  lastTs = 0;
}

function ensureLoop() {
  if (rafId !== null || typeof requestAnimationFrame === 'undefined') return;
  lastTs = 0;
  const loop = (ts: number) => {
    const state = usePlayerStore.getState();
    if (state.status !== 'playing') {
      rafId = null;
      lastTs = 0;
      return;
    }
    const dt = lastTs === 0 ? 16 : Math.min(120, ts - lastTs);
    lastTs = ts;
    state._tick(dt);
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

/**
 * Element ids are derived from the beat id (`b0` + slot), and every parsed
 * lesson reuses those ids. Stamping the lesson keeps a follow-up from
 * overwriting the lesson already on the board.
 */
let lessonSeq = 0;
function stampBeats(lesson: Lesson): LessonBeat[] {
  lessonSeq += 1;
  const stamp = `L${lessonSeq.toString(36)}-`;
  // Saved lessons are stored as `{ speech, draws }` only, so a beat can arrive
  // without an id. Fall back to its index: without that every beat shares the
  // stamped "…undefined" id and later beats overwrite earlier drawings on the
  // board (replay used to lose the title and the roadmap).
  return lesson.beats.map((beat, index) => ({
    ...beat,
    id: `${stamp}${beat.id ?? `b${index}`}`,
  }));
}

/** Structural commands mutate the list; everything else becomes an element. */
function isStructural(op: string): boolean {
  return op === 'ERASE' || op === 'GROUP' || op === 'MOVE';
}

/**
 * Give every visual command a stable id derived from its beat + slot, so a
 * replayed beat upserts instead of duplicating.
 */
function ensureId(raw: LessonBeat['draws'][number], beatId: string, slot: number) {
  if (isStructural(raw.op) || ('id' in raw && raw.id)) return raw;
  return { ...raw, id: `${beatId}s${slot}` } as LessonBeat['draws'][number];
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  status: 'idle',
  queue: [],
  index: 0,
  title: '',
  error: null,
  follow: true,
  muted: false,
  revealSeq: 0,
  lastRevealedId: null,

  setLoading: () => {
    stopLoop();
    cancelSpeech();
    clearResumeStack();
    set({ status: 'loading' });
  },

  start: (lesson, opts) => {
    cancelSpeech();
    stopLoop();
    clearResumeStack();
    const board = useBoardStore.getState();
    if (opts?.clear) board.clear();
    set({
      status: 'playing',
      queue: stampBeats(lesson),
      index: 0,
      title: lesson.title,
      error: null,
    });
    get()._enterBeat(0);
    ensureLoop();
  },

  answer: (lesson) => {
    const state = get();
    const wasActive = state.status === 'playing' || state.status === 'paused';

    if (!wasActive) {
      // Nothing playing: the reply is just a lesson on the existing board.
      set({
        status: 'playing',
        queue: stampBeats(lesson),
        index: 0,
        title: lesson.title,
        error: null,
      });
      get()._enterBeat(0);
      ensureLoop();
      return;
    }

    // Splice the reply directly after the beat that was interrupted, then
    // jump playback to it. The interrupted beat's cursor is parked on the
    // resume stack; when the reply ends, playback pops back into the original
    // beat exactly where it stopped — no sentence and no drawing is lost.
    const reply = stampBeats(lesson);
    const insertAt = state.index + 1;
    resumeStack.push({
      beatIndex: state.index,
      replyEndIndex: insertAt + reply.length,
      cursor: {
        elapsedMs: cursor.elapsedMs,
        speechEnded: cursor.speechEnded,
        slotsDone: [...cursor.slotsDone],
        nextSlotAt: 0,
      },
    });
    const queue = [...state.queue.slice(0, insertAt), ...reply, ...state.queue.slice(insertAt)];
    cancelSpeech();
    set({ queue, status: 'playing', title: state.title || lesson.title });
    get()._enterBeat(insertAt);
    ensureLoop();
  },

  pause: () => {
    const state = get();
    if (state.status !== 'playing') return;
    pauseSpeech();
    stopLoop();
    set({ status: 'paused' });
  },

  resume: () => {
    const state = get();
    if (state.status !== 'paused') return;
    resumeSpeech();
    set({ status: 'playing' });
    ensureLoop();
    // If speech already ended while paused (fallback timer), the first tick
    // will advance naturally; nothing else to do here.
  },

  toggle: () => {
    const { status } = get();
    if (status === 'playing') get().pause();
    else if (status === 'paused') get().resume();
  },

  interrupt: () => get().pause(),

  stop: () => {
    stopLoop();
    cancelSpeech();
    clearResumeStack();
    set({ status: 'idle', queue: [], index: 0, title: '', error: null });
  },

  skip: () => {
    const state = get();
    if (state.status !== 'playing' && state.status !== 'paused') return;
    // Fire every remaining slot of the current beat instantly…
    const beat = state.queue[state.index];
    if (beat) {
      const board = useBoardStore.getState();
      beat.draws.forEach((raw, slot) => {
        if (cursor.slotsDone[slot]) return;
        cursor.slotsDone[slot] = true;
        const cmd = ensureId(raw, beat.id, slot);
        board.apply(cmd, { silent: true });
        if (!isStructural(cmd.op)) {
          const elementId = (cmd as { id?: string }).id;
          if (elementId) board.reveal(elementId);
        }
      });
    }
    cursor.currentHandle?.cancel();
    cursor.currentHandle = null;
    cursor.speechEnded = true;
    get()._tick(0); // advances to the next beat immediately
    if (get().status === 'playing') ensureLoop();
  },

  flush: () => {
    stopLoop();
    cancelSpeech();
    clearResumeStack();
    useBoardStore.getState().revealAll();
    set({ status: 'done', index: get().queue.length, revealSeq: get().revealSeq + 1 });
  },

  setFollow: (value) => set({ follow: value }),
  setMuted: (value) => set({ muted: value }),

  _enterBeat: (index) => {
    // Playback reaching a parked interruption point means the spliced reply
    // just finished: pop the record and resume the interrupted beat from its
    // saved position (drawn slots stay, the sentence replays from the start).
    const pending = resumeStack[resumeStack.length - 1];
    if (pending && index >= pending.replyEndIndex) {
      resumeStack.pop();
      const restoredBeatIndex = pending.beatIndex;
      cursor.elapsedMs = pending.cursor.elapsedMs;
      cursor.speechEnded = pending.cursor.speechEnded;
      cursor.slotsDone = pending.cursor.slotsDone;
      cursor.nextSlotAt = 0;
      cursor.currentHandle = null;
      set({ index: restoredBeatIndex });
      const beat = get().queue[restoredBeatIndex];
      if (beat && !cursor.speechEnded) {
        // No history push — the beat's undo checkpoint was already recorded.
        cursor.currentHandle = speak(beat.speech, {
          volume: get().muted ? 0 : 1,
          onEnd: () => get()._speechEnded(),
        });
      }
      return;
    }

    const state = get();
    const beat = state.queue[index];

    if (!beat) {
      stopLoop();
      cancelSpeech();
      set({ status: 'done', index: state.queue.length });
      return;
    }

    cursor.elapsedMs = 0;
    cursor.speechEnded = beat.speech.trim().length === 0;
    cursor.slotsDone = beat.draws.map(() => false);
    cursor.nextSlotAt = 0;

    // One undo checkpoint per beat: undoing takes the whole beat back.
    if (beat.draws.length > 0) useBoardStore.getState().pushHistory();

    set({ index });

    if (!cursor.speechEnded) {
      const muted = get().muted;
      cursor.currentHandle = speak(beat.speech, {
        volume: muted ? 0 : 1,
        onEnd: () => get()._speechEnded(),
      });
    }
  },

  _speechEnded: () => {
    cursor.speechEnded = true;
    // Try to advance right away if the drawing already caught up.
    get()._tick(0);
  },

  _tick: (dt) => {
    const state = get();
    if (state.status !== 'playing') return;
    const beat = state.queue[state.index];
    if (!beat) {
      get()._enterBeat(state.queue.length);
      return;
    }

    cursor.elapsedMs += dt;
    const board = useBoardStore.getState();

    beat.draws.forEach((raw, slot) => {
      if (cursor.slotsDone[slot]) return;
      // One element at a time: the previous line must finish inking before
      // the pen moves on, otherwise the hand and the ink drift apart.
      if (cursor.elapsedMs < cursor.nextSlotAt) return;
      cursor.slotsDone[slot] = true;

      const cmd = ensureId(raw, beat.id, slot);
      board.apply(cmd, { silent: true });

      if (isStructural(cmd.op)) {
        cursor.nextSlotAt = cursor.elapsedMs + STAGGER_MS / 3;
        return;
      }

      const elementId = (cmd as { id?: string }).id;
      if (!elementId) {
        cursor.nextSlotAt = cursor.elapsedMs + STAGGER_MS;
        return;
      }

      board.reveal(elementId);
      set({ revealSeq: get().revealSeq + 1, lastRevealedId: elementId });
      const box = resolveBBox(useBoardStore.getState().elements, elementId);
      cursor.nextSlotAt = cursor.elapsedMs + inkDurationMs(box ? box.w : STAGGER_MS);
    });

    const allSlotsDone = cursor.slotsDone.every(Boolean);
    if (cursor.speechEnded && allSlotsDone) {
      get()._enterBeat(state.index + 1);
    }
  },
}));

/** Test/demo helper: build a board directly from a lesson (no playback). */
export function materializeLesson(lesson: Lesson): BoardElement[] {
  const board = useBoardStore.getState();
  board.reset();
  lesson.beats.forEach((beat) =>
    beat.draws.forEach((raw, slot) => {
      const cmd = ensureId(raw, beat.id, slot);
      if (!isStructural(cmd.op)) {
        board.apply(cmd, { silent: true });
        const elementId = (cmd as { id?: string }).id;
        if (elementId) board.reveal(elementId);
      }
    }),
  );
  return useBoardStore.getState().elements;
}
