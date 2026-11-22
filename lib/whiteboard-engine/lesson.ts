/**
 * Lesson model — what the teaching AI emits.
 *
 * A lesson is a list of beats. Each beat couples one spoken sentence with the
 * drawing commands that should appear while it is being said. The player
 * (use-lesson-player) walks this list; the renderer only ever sees the
 * accumulated DrawCommands.
 */
import { z } from 'zod';
import { BOARD_WIDTH, commandBBox, parseDrawCommands, type BBox, type DrawCommand } from './dsl';

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

/**
 * The model is good at deciding WHAT to draw and bad at deciding WHERE. Left
 * alone it scatters labels across the board, stacks shapes on top of text and
 * leaves half the paper empty. The board is therefore laid out here: each
 * beat's cluster is centred in the readable column and stacked below the
 * previous one, so the lesson reads top-to-bottom like a teacher writing.
 *
 * Only whole beats are moved, never elements inside one, so arrows and labels
 * that belong together keep their relationship.
 */
const SAFE_X = 56;
const SAFE_TOP = 44;
const BEAT_GAP = 40;

function shiftCommand(cmd: DrawCommand, dx: number, dy: number): DrawCommand {
  switch (cmd.op) {
    case 'TEXT':
    case 'MATH':
    case 'CODE':
    case 'RECTANGLE':
    case 'TABLE':
    case 'FLOWCHART':
      return { ...cmd, x: cmd.x + dx, y: cmd.y + dy };
    case 'LINE':
    case 'ARROW':
      return { ...cmd, x1: cmd.x1 + dx, y1: cmd.y1 + dy, x2: cmd.x2 + dx, y2: cmd.y2 + dy };
    case 'CIRCLE':
      return { ...cmd, cx: cmd.cx + dx, cy: cmd.cy + dy };
    case 'HIGHLIGHT':
      return cmd.region
        ? { ...cmd, region: { ...cmd.region, x: cmd.region.x + dx, y: cmd.region.y + dy } }
        : cmd;
    default:
      // ERASE/GROUP/MOVE address other elements by id; they travel with the
      // beat they belong to and must not be rewritten.
      return cmd;
  }
}

/** Text wider than the column would run off the paper; shrink it to fit. */
function shrinkTextToFit(cmd: DrawCommand, maxWidth: number): DrawCommand {
  if (cmd.op !== 'TEXT' && cmd.op !== 'MATH' && cmd.op !== 'CODE') return cmd;
  const box = commandBBox(cmd);
  if (!box || box.w <= maxWidth) return cmd;
  const factor = Math.max(0.55, maxWidth / box.w);
  return { ...cmd, size: Math.max(12, Math.round(cmd.size * factor)) };
}

/** Commands that read as a line of words: never allowed to overlap. */
function isTextLike(cmd: DrawCommand): boolean {
  return cmd.op === 'TEXT' || cmd.op === 'MATH' || cmd.op === 'CODE';
}

function boxesOverlap(a: BBox, b: BBox, pad: number): boolean {
  return (
    a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y
  );
}

/**
 * The model authors one y per line and regularly underestimates its own line
 * height, so two lines land on top of each other and the board reads as
 * scribble. Text-like commands keep their authored order, but any line that
 * would collide with an earlier one is pushed down until it clears it.
 */
function separateTextRows(draws: DrawCommand[]): DrawCommand[] {
  const out = [...draws];
  const placed: BBox[] = [];

  for (let index = 0; index < out.length; index += 1) {
    const cmd = out[index];
    if (!isTextLike(cmd)) continue;
    let current = cmd;
    let box = commandBBox(current);
    if (!box) continue;

    let guard = 0;
    while (guard < 8) {
      guard += 1;
      const hit = placed.find((other) => boxesOverlap(other, box as BBox, 6));
      if (!hit) break;
      // Shift from the command's CURRENT position: shifting the original
      // each pass made a line bounce between two rows instead of clearing
      // both, which is exactly how rows ended up stacked on each other.
      current = shiftCommand(current, 0, Math.ceil(hit.y + hit.h + 8 - box.y));
      out[index] = current;
      const next = commandBBox(current);
      if (!next) break;
      box = next;
    }
    placed.push(box);
  }

  return out;
}

function layoutBeats(beats: LessonBeat[], startY = SAFE_TOP): void {
  const column = BOARD_WIDTH - SAFE_X * 2;
  let cursorY = Math.max(SAFE_TOP, Math.round(startY));

  for (const beat of beats) {
    // A highlight that points at an element from an earlier beat would flick
    // to the old position once the beats separate; keep only same-beat ones.
    const localIds = new Set(
      beat.draws.map((cmd) => ('id' in cmd ? cmd.id : undefined)).filter(Boolean) as string[],
    );
    beat.draws = separateTextRows(
      beat.draws
        .filter((cmd) => cmd.op !== 'HIGHLIGHT' || !cmd.target || localIds.has(cmd.target))
        .map((cmd) => shrinkTextToFit(cmd, column)),
    );

    const boxes = beat.draws
      .map((cmd) => commandBBox(cmd))
      .filter((box): box is BBox => Boolean(box));
    if (boxes.length === 0) continue;

    const minX = Math.min(...boxes.map((b) => b.x));
    const maxX = Math.max(...boxes.map((b) => b.x + b.w));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxY = Math.max(...boxes.map((b) => b.y + b.h));
    const width = maxX - minX;

    // Centre in the readable column, then pull back inside the margins.
    let dx = Math.round((BOARD_WIDTH - width) / 2 - minX);
    if (minX + dx < SAFE_X) dx += SAFE_X - (minX + dx);
    if (maxX + dx > BOARD_WIDTH - SAFE_X) dx -= maxX + dx - (BOARD_WIDTH - SAFE_X);
    if (width > column) dx = SAFE_X - minX;

    const dy = Math.round(cursorY - minY);
    beat.draws = beat.draws.map((cmd) => shiftCommand(cmd, dx, dy));
    cursorY += Math.round(maxY - minY) + BEAT_GAP;
  }
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
  // Emphasis is a word or a line, never a backdrop for a whole diagram. The
  // model reliably ignores the size guidance, so bound the region here: a
  // 520x260 wash still covers a fifth of the board and buries the drawing.
  const { w, h } = cmd.region;
  return w > 620 || h > 140 || w * h > 80_000;
}

/**
 * A line that is really source code, not prose: parentheses, braces or
 * statement keywords in a latin identifier context. Plain arithmetic prose
 * ("الشغل = القوة × المسافة") never matches.
 */
const CODEISH =
  /(\{|\}|;|\[\s*\]|\b(?:print|printf|puts|console\.log|def|function|return|let|const|var|int|char|float|double|string|for|while|if|else|elif|class|import|from|range)\b|[A-Za-z_]\w*\s*\()/;

/**
 * Clean one draw command before layout:
 * - a filled rectangle with no label is decoration (the model paints bars
 *   and blobs under the lesson), so it is dropped;
 * - a TEXT line that is really code becomes CODE, so it is rendered as one
 *   left-to-right run instead of being bidi-shuffled with Arabic;
 * - a TEXT line that mixes Arabic explanation with code punctuation is
 *   dropped: the spoken sentence still explains it, and drawing it would be
 *   unreadable at any size;
 * - an off-target highlight box is dropped rather than left floating.
 */
function normalizeDrawCommand(cmd: DrawCommand): DrawCommand | null {
  if (cmd.op === 'RECTANGLE') {
    const decorativeFill = cmd.fill !== 'none' && !cmd.label;
    if (decorativeFill && (cmd.w * cmd.h > 12_000 || cmd.w < 40 || cmd.h < 24)) return null;
    return cmd;
  }

  if (cmd.op === 'CODE') {
    const text = cmd.text.replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();
    if (!text) return null;
    // Arabic prose belongs in TEXT, not in the code face. Program output is
    // the one exception: printing an Arabic string is real program behaviour.
    // A line that mixes Arabic with latin code (e.g. print('مرحبا')) stays
    // CODE and is rendered as one LTR run, so the quotes stay around it.
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    const hasLatin = /[A-Za-z]/.test(text);
    if (hasArabic && !hasLatin && cmd.tone !== 'output') {
      return {
        op: 'TEXT',
        ...(cmd.id ? { id: cmd.id } : {}),
        x: cmd.x,
        y: cmd.y,
        text,
        size: Math.min(30, Math.max(16, cmd.size)),
        weight: 400,
        anchor: 'start',
        rotate: 0,
        ...(cmd.color ? { color: cmd.color } : {}),
      };
    }
    return { ...cmd, text };
  }

  if (cmd.op === 'TEXT') {
    const hasArabic = /[\u0600-\u06FF]/.test(cmd.text);
    const hasCode = CODEISH.test(cmd.text);
    if (hasCode && hasArabic) return null;
    if (hasCode && !hasArabic) {
      return {
        op: 'CODE',
        ...(cmd.id ? { id: cmd.id } : {}),
        x: cmd.x,
        y: cmd.y,
        text: cmd.text.replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim(),
        lang: 'other',
        tone: 'plain',
        size: Math.min(30, Math.max(16, cmd.size)),
        ...(cmd.color ? { color: cmd.color } : {}),
      };
    }
    return cmd;
  }

  if (cmd.op === 'HIGHLIGHT' && cmd.region) {
    const { w, h } = cmd.region;
    if (cmd.mode === 'box' && (h > 90 || w > 520)) return null;
    if (cmd.mode === 'circle' && (w > 420 || h > 200)) return null;
    if (cmd.mode === 'underline' && w > 620) return null;
  }

  return cmd;
}

/**
 * One CODE command per physical line: models sometimes pack a whole snippet
 * into one string with `\n`, which a single SVG <text> cannot break. Splitting
 * here also guarantees the "code line lives on its own line" rule even when
 * the model ignores it.
 */
function explodeCodeLines(draws: DrawCommand[]): DrawCommand[] {
  const out: DrawCommand[] = [];
  for (const cmd of draws) {
    if (cmd.op !== 'CODE' || !/[\r\n]/.test(cmd.text)) {
      out.push(cmd);
      continue;
    }
    const lines = cmd.text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+$/, ''))
      .filter((line) => line.trim().length > 0)
      .slice(0, 8);
    if (lines.length === 0) continue;
    const step = Math.ceil(cmd.size * 1.5) + 10;
    lines.forEach((line, index) => {
      out.push({
        ...cmd,
        ...(index > 0 ? { id: undefined } : {}),
        text: line.slice(0, 240),
        y: cmd.y + index * step,
      });
    });
  }
  return out;
}

/**
 * A shape with no label that wraps no text is decoration: the model's habit
 * of painting random rectangles/circles around the board is exactly what made
 * lessons look broken. Shapes that label themselves, or that visibly contain
 * a text/code/math line, are real diagrams and stay.
 */
function dropUnlabeledShapes(draws: DrawCommand[]): DrawCommand[] {
  const textBoxes = draws
    .filter((cmd) => cmd.op === 'TEXT' || cmd.op === 'CODE' || cmd.op === 'MATH')
    .map((cmd) => commandBBox(cmd))
    .filter((box): box is BBox => Boolean(box));

  return draws.filter((cmd) => {
    if (cmd.op !== 'RECTANGLE' && cmd.op !== 'CIRCLE') return true;
    if (cmd.label?.trim()) return true;
    const box = commandBBox(cmd);
    if (!box) return false;

    return textBoxes.some((text) => {
      const centerX = text.x + text.w / 2;
      const centerY = text.y + text.h / 2;
      if (cmd.op === 'CIRCLE') {
        const dx = centerX - cmd.cx;
        const dy = centerY - cmd.cy;
        return Math.hypot(dx, dy) <= cmd.r * 1.15;
      }
      return (
        centerX >= cmd.x && centerX <= cmd.x + cmd.w && centerY >= cmd.y && centerY <= cmd.y + cmd.h
      );
    });
  });
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

export interface LayoutOptions {
  /** Where the first beat may start — below an interrupted lesson, else the top. */
  startY?: number;
}

export function parseLesson(input: unknown, options: LayoutOptions = {}): ParsedLesson | null {
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
    const draws: DrawCommand[] = [];
    for (const cmd of parsedDraws) {
      if (isOversizedWash(cmd)) {
        dropped += 1;
        continue;
      }
      const normalized = normalizeDrawCommand(cmd);
      if (normalized === null) {
        dropped += 1;
        continue;
      }
      draws.push(normalized);
    }
    const cleaned = dropUnlabeledShapes(explodeCodeLines(draws));
    dropped += draws.length - cleaned.length;
    const speech = beat.speech.trim();
    if (!speech && cleaned.length === 0) return; // empty beat — skip
    beats.push({ id: `b${index}`, speech, draws: cleaned });
  });

  if (beats.length === 0) return null;
  layoutBeats(beats, options.startY);
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
        {
          op: 'TEXT',
          x: 80,
          y: 90,
          text: 'قانون نيوتن الثاني',
          size: 44,
          weight: 700,
          color: '#3D315E',
          anchor: 'start',
        },
        {
          op: 'HIGHLIGHT',
          region: { x: 70, y: 56, w: 430, h: 56 },
          mode: 'wash',
          color: '#FFD84D',
        },
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
        {
          op: 'RECTANGLE',
          x: 90,
          y: 330,
          w: 360,
          h: 150,
          rx: 18,
          stroke: '#5B3FC7',
          strokeWidth: 3,
          fill: 'none',
          label: 'كتلة أكبر ← تسارع أقل',
          labelSize: 22,
        },
        {
          op: 'CIRCLE',
          cx: 700,
          cy: 405,
          r: 95,
          stroke: '#9178E6',
          strokeWidth: 3,
          fill: 'none',
          label: 'a = F / m',
          labelSize: 24,
        },
        { op: 'LINE', x1: 470, y1: 405, x2: 590, y2: 405, color: '#FFD84D', width: 5 },
      ],
    },
    {
      speech: 'وبكده نقدر نحسب أي قوة لو عرفنا الكتلة والتسارع.',
      draws: [
        {
          op: 'TABLE',
          id: 'b3t',
          x: 120,
          y: 545,
          headers: ['الكمية', 'الرمز'],
          rows: [
            ['القوة', 'F'],
            ['الكتلة', 'm'],
            ['التسارع', 'a'],
          ],
          width: 420,
          headerFill: '#5B3FC7',
        },
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
/* ── reading a model reply ───────────────────────────────────────────
   The teaching model usually answers with bare JSON, but sometimes wraps it
   in prose or a fence, leaves a trailing comma, or glues the next key onto an
   op value. All of that is recoverable here; anything that still does not
   validate is reported as a failure rather than drawn as a canned lesson. */

/**
 * `"op":"ELLIPSEx":520` instead of `"op":"ELLIPSE","x":520` makes the whole
 * reply invalid JSON. An op value is always an ALL-CAPS name, so a lowercase
 * key glued to it can be re-split safely; an unknown op is dropped downstream.
 */
const GLUED_OP = /("op"\s*:\s*")([A-Z]+)([a-z][A-Za-z0-9_]*)("\s*:)/g;

function repairJson(candidate: string): string {
  return candidate
    .replace(/,\s*([}\]])/g, '$1') // trailing comma before } or ]
    .replace(GLUED_OP, '$1$2","$3$4');
}

/**
 * LaTeX is the one place a model reliably writes illegal JSON: `"\sqrt"` is
 * not a JSON escape, so one formula invalidates the whole reply, and `"\rho"`
 * silently turns into a carriage return. Both are repaired here — a backslash
 * in front of anything that is not a JSON escape becomes a literal backslash,
 * and a raw control character becomes the LaTeX command it stood for. Only
 * text inside strings is touched, so structure cannot be damaged.
 */
const LATEX_CONTROL: Record<string, string> = {
  '\r': '\\\\r',
  '\f': '\\\\f',
  '\b': '\\\\b',
  '\t': '\\\\t',
};

function escapeLatexBare(candidate: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }
    if (ch === '\\') {
      const next = candidate[i + 1];
      if (next === '"' || next === '\\' || next === '/' || 'bfnrt'.includes(next ?? ' ')) {
        out += ch + next;
        i += 1;
        continue;
      }
      if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(candidate.slice(i + 2, i + 6))) {
        out += candidate.slice(i, i + 6);
        i += 5;
        continue;
      }
      // `\sqrt`, `\Delta`, a lone backslash: keep it as LaTeX text.
      out += '\\\\';
      continue;
    }
    const latex = LATEX_CONTROL[ch];
    if (latex) {
      out += latex;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20) {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
      continue;
    }
    out += ch;
  }
  return out;
}

function tryParseOnce(candidate: string): unknown {
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return undefined;
  }
}

function tryParse(candidate: string): unknown {
  const direct = tryParseOnce(candidate);
  if (direct !== undefined) return direct;
  for (const attempt of [
    repairJson(candidate),
    escapeLatexBare(candidate),
    escapeLatexBare(repairJson(candidate)),
  ]) {
    if (attempt === candidate) continue;
    const parsed = tryParseOnce(attempt);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

/** Index of the brace that closes the object opened at `start`. */
function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Pull the lesson object out of a model reply. Brace matching ignores braces
 * inside strings, so a LaTeX example before the JSON no longer breaks it the
 * way a greedy `/{[\s\S]*}/` match did.
 */
export function extractLessonJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const direct = tryParse(cleaned);
  if (direct !== undefined) return direct;

  for (let start = cleaned.indexOf('{'); start !== -1; start = cleaned.indexOf('{', start + 1)) {
    const end = matchingBrace(cleaned, start);
    if (end === -1) continue;
    const parsed = tryParse(cleaned.slice(start, end + 1));
    if (parsed !== undefined) return parsed;
  }
  return null;
}

/** Read a raw model reply all the way to a validated lesson. */
export function parseLessonReply(text: string, options: LayoutOptions = {}): ParsedLesson | null {
  return parseLesson(extractLessonJson(text), options);
}
