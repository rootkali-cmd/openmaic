/**
 * Lesson model — what the teaching AI emits.
 *
 * A lesson is a list of beats. Each beat couples one spoken sentence with the
 * drawing commands that should appear while it is being said. The player
 * (use-lesson-player) walks this list; the renderer only ever sees the
 * accumulated DrawCommands.
 */
import { z } from 'zod';
import { parseDrawCommands, type DrawCommand } from './dsl';

const beatSchema = z.object({
  /** The sentence the teacher says out loud (Modern Standard Arabic). */
  speech: z.string().max(600).default(''),
  /** Drawing commands revealed progressively while the sentence plays. */
  draws: z.array(z.unknown()).max(8).default([]),
});

const lessonSchema = z.object({
  title: z.string().min(1).max(120),
  beats: z.array(beatSchema).min(1).max(8),
});

export interface LessonBeat {
  id: string;
  speech: string;
  draws: DrawCommand[];
}

export interface Lesson {
  title: string;
  beats: LessonBeat[];
}

export interface ParsedLesson {
  lesson: Lesson;
  /** Commands dropped by validation (surfaced for logging, never rendered). */
  dropped: number;
}

/**
 * A highlight is emphasis, not a background wash. Models occasionally paint
 * half the board yellow, which buries the lesson; such regions are dropped
 * rather than rendered.
 */
function isOversizedWash(cmd: DrawCommand): boolean {
  if (cmd.op !== 'HIGHLIGHT' || !cmd.region) return false;
  if (cmd.mode && cmd.mode !== 'wash') return false;
  return cmd.region.w > 720 || cmd.region.h > 280;
}

/**
 * Validate the teaching model's JSON into a Lesson. Invalid beats are
 * dropped; invalid draw commands inside a beat are filtered out.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseLesson(input: unknown): ParsedLesson | null {
  // Models drift on the soft limits (an over-long sentence, a ninth draw).
  // Clamp those instead of rejecting a lesson that is otherwise usable.
  const root = asRecord(input);
  if (!root) return null;
  const title = typeof root.title === 'string' ? root.title.trim().slice(0, 120) : '';
  const rawBeats = Array.isArray(root.beats) ? root.beats.slice(0, 8) : [];
  if (!title || rawBeats.length === 0) return null;

  const normalized = rawBeats.map((beat) => {
    const record = asRecord(beat) ?? {};
    return {
      speech: typeof record.speech === 'string' ? record.speech.trim().slice(0, 600) : '',
      draws: Array.isArray(record.draws) ? record.draws.slice(0, 8) : [],
    };
  });

  const parsed = lessonSchema.safeParse({ title, beats: normalized });
  if (!parsed.success) return null;

  let dropped = 0;
  const beats: LessonBeat[] = [];

  parsed.data.beats.forEach((beat, index) => {
    const raw = Array.isArray(beat.draws) ? beat.draws : [];
    const parsedDraws = parseDrawCommands(raw);
    dropped += raw.length - parsedDraws.length;
    const draws = parsedDraws.filter((cmd) => {
      if (!isOversizedWash(cmd)) return true;
      dropped += 1;
      return false;
    });
    const speech = beat.speech.trim();
    if (!speech && draws.length === 0) return; // empty beat — skip
    beats.push({ id: `b${index}`, speech, draws });
  });

  if (beats.length === 0) return null;
  return {
    lesson: { title: parsed.data.title.trim(), beats },
    dropped,
  };
}

/**
 * Fallback lesson used when the model is unreachable — the board must never
 * dead-end on a network error. Authored as raw input and run through the
 * same parser as live lessons, so it is validated (and defaulted) exactly
 * like AI output.
 */
const FALLBACK_RAW = {
  title: 'قانون نيوتن الثاني',
  beats: [
    {
      speech: 'هنتكلم النهارده عن قانون نيوتن الثاني لحركة الأجسام.',
      draws: [
        { op: 'TEXT', x: 80, y: 90, text: 'قانون نيوتن الثاني', size: 44, weight: 700, color: '#3D315E', anchor: 'start' },
        { op: 'HIGHLIGHT', region: { x: 70, y: 56, w: 430, h: 56 }, mode: 'wash', color: '#FFD84D' },
      ],
    },
    {
      speech: 'القانون بيقول: القوة تساوي الكتلة في التسارع.',
      draws: [
        { op: 'MATH', x: 120, y: 220, latex: 'F = m \\times a', size: 56, color: '#5B3FC7' },
        { op: 'ARROW', x1: 480, y1: 205, x2: 700, y2: 205, color: '#9178E6', width: 3 },
        { op: 'TEXT', x: 715, y: 212, text: 'القوة', size: 24, color: '#5B3FC7', weight: 700 },
      ],
    },
    {
      speech: 'لو زدنا التسارع زادت القوة، ولو زدنا الكتلة احتاجت قوة أكبر.',
      draws: [
        { op: 'RECTANGLE', x: 90, y: 330, w: 360, h: 150, rx: 18, stroke: '#5B3FC7', strokeWidth: 3, fill: 'none', label: 'كتلة أكبر ← تسارع أقل', labelSize: 22 },
        { op: 'CIRCLE', cx: 700, cy: 405, r: 95, stroke: '#9178E6', strokeWidth: 3, fill: 'none', label: 'a = F / m', labelSize: 24 },
        { op: 'LINE', x1: 470, y1: 405, x2: 590, y2: 405, color: '#FFD84D', width: 5 },
      ],
    },
    {
      speech: 'وبكده نقدر نحسب أي قوة لو عرفنا الكتلة والتسارع.',
      draws: [
        { op: 'TABLE', id: 'b3t', x: 120, y: 545, headers: ['الكمية', 'الرمز'], rows: [['القوة', 'F'], ['الكتلة', 'm'], ['التسارع', 'a']], width: 420, headerFill: '#5B3FC7' },
        { op: 'HIGHLIGHT', target: 'b3t', mode: 'underline', color: '#FFD84D' },
      ],
    },
  ],
};

const parsedFallback = parseLesson(FALLBACK_RAW);
if (!parsedFallback || parsedFallback.dropped > 0) {
  // Loud in development, harmless in production (the player tolerates an
  // empty lesson): the static fallback must stay valid as the DSL evolves.
  console.error('FALLBACK_LESSON failed DSL validation', parsedFallback);
}

export const FALLBACK_LESSON: Lesson = parsedFallback?.lesson ?? {
  title: 'درس السبورة',
  beats: [],
};