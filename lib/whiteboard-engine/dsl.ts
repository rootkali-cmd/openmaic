/**
 * Drawing DSL — the structured drawing language of the AI Whiteboard Engine.
 *
 * The teaching model never emits code, markup or images: it emits a JSON array
 * of typed commands from this schema, the server validates them, and the client
 * renderer turns them into SVG. Anything that fails validation is dropped
 * before it can reach the board.
 *
 * Pipeline: Student Question → Teaching AI → DrawCommand[] → Renderer → Board
 */
import { z } from 'zod';

/** Board coordinate space. Every command is authored inside this box. */
export const BOARD_WIDTH = 1000;
export const BOARD_HEIGHT = 720;

/**
 * The lesson palette — deep purple ink with a single yellow emphasis tone,
 * mirroring the board's "deep purple drawing elements + yellow emphasis".
 */
export const PALETTE = {
  ink: '#3D315E',
  purple: '#5B3FC7',
  violet: '#9178E6',
  yellow: '#FFD84D',
  blue: '#5FA0FC',
  green: '#00C386',
  coral: '#FB7E5B',
  muted: '#8B82B8',
  paper: '#E9E4F7',
} as const;

const coord = z.number().min(-2000).max(4000);
const hex = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'expected a hex color');
const id = z.string().min(1).max(64);

/* ── TEXT ─────────────────────────────────────────────────────────── */
export const textCommand = z.object({
  op: z.literal('TEXT'),
  id: id.optional(),
  x: coord,
  y: coord,
  text: z.string().min(1).max(600),
  size: z.number().min(8).max(120).default(26),
  color: hex.optional(),
  weight: z.union([z.literal(400), z.literal(700)]).default(400),
  anchor: z.enum(['start', 'middle', 'end']).default('start'),
  rotate: z.number().min(-180).max(180).default(0),
});

/* ── MATH ─────────────────────────────────────────────────────────── */
export const mathCommand = z.object({
  op: z.literal('MATH'),
  id: id.optional(),
  x: coord,
  y: coord,
  latex: z.string().min(1).max(400),
  size: z.number().min(8).max(120).default(28),
  color: hex.optional(),
  display: z.boolean().default(true),
});

/* ── CODE ─────────────────────────────────────────────────────────── */
/**
 * One line of code, rendered left-to-right in a monospace face.
 *
 * Code must never travel inside TEXT: a mixed Arabic/English line is
 * re-ordered by the bidi algorithm and both halves become unreadable. The
 * lesson prompt puts every code line in its own CODE command, and the
 * renderer isolates it as a single LTR run.
 */
export const codeCommand = z.object({
  op: z.literal('CODE'),
  id: id.optional(),
  x: coord,
  y: coord,
  text: z.string().min(1).max(240),
  lang: z
    .enum(['python', 'javascript', 'typescript', 'c', 'cpp', 'java', 'html', 'css', 'sql', 'other'])
    .default('other'),
  /** `plain` code, `input` data handed to the program, `output` what it prints. */
  tone: z.enum(['plain', 'input', 'output', 'comment']).default('plain'),
  size: z.number().min(12).max(38).default(22),
  color: hex.optional(),
});

/* ── LINE / ARROW ─────────────────────────────────────────────────── */
const strokeFields = {
  color: hex.optional(),
  width: z.number().min(1).max(14).default(3),
  style: z.enum(['solid', 'dashed', 'dotted']).default('solid'),
};

export const lineCommand = z.object({
  op: z.literal('LINE'),
  id: id.optional(),
  x1: coord,
  y1: coord,
  x2: coord,
  y2: coord,
  ...strokeFields,
});

export const arrowCommand = z.object({
  op: z.literal('ARROW'),
  id: id.optional(),
  x1: coord,
  y1: coord,
  x2: coord,
  y2: coord,
  curve: z.boolean().default(false),
  double: z.boolean().default(false),
  ...strokeFields,
});

/* ── CIRCLE / RECTANGLE ───────────────────────────────────────────── */
export const circleCommand = z.object({
  op: z.literal('CIRCLE'),
  id: id.optional(),
  cx: coord,
  cy: coord,
  r: z.number().min(4).max(1200),
  fill: z.union([hex, z.literal('none')]).default('none'),
  stroke: hex.optional(),
  strokeWidth: z.number().min(1).max(14).default(3),
  label: z.string().max(80).optional(),
  labelSize: z.number().min(8).max(64).default(20),
});

export const rectangleCommand = z.object({
  op: z.literal('RECTANGLE'),
  id: id.optional(),
  x: coord,
  y: coord,
  w: z.number().min(4).max(2400),
  h: z.number().min(4).max(2400),
  rx: z.number().min(0).max(200).default(12),
  fill: z.union([hex, z.literal('none')]).default('none'),
  stroke: hex.optional(),
  strokeWidth: z.number().min(1).max(14).default(3),
  label: z.string().max(80).optional(),
  labelSize: z.number().min(8).max(64).default(20),
});

/* ── FLOWCHART ────────────────────────────────────────────────────── */
const flowNode = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(['rect', 'diamond', 'ellipse', 'stadium']).default('rect'),
  label: z.string().min(1).max(80),
});
const flowEdge = z.object({
  from: z.string().min(1).max(40),
  to: z.string().min(1).max(40),
  label: z.string().max(40).optional(),
});

export const flowchartCommand = z.object({
  op: z.literal('FLOWCHART'),
  id: id.optional(),
  x: coord,
  y: coord,
  direction: z.enum(['LR', 'TB']).default('TB'),
  nodes: z.array(flowNode).min(2).max(12),
  edges: z.array(flowEdge).max(16).default([]),
  nodeW: z.number().min(60).max(400).default(150),
  nodeH: z.number().min(40).max(240).default(68),
  gap: z.number().min(24).max(240).default(64),
  fill: z.union([hex, z.literal('none')]).default('none'),
  stroke: hex.optional(),
});

/* ── TABLE ────────────────────────────────────────────────────────── */
export const tableCommand = z.object({
  op: z.literal('TABLE'),
  id: id.optional(),
  x: coord,
  y: coord,
  headers: z.array(z.string().min(1).max(40)).min(1).max(8),
  rows: z.array(z.array(z.string().max(120))).max(14),
  width: z.number().min(160).max(1600).default(620),
  colWidths: z.array(z.number().min(0.05).max(1)).max(8).optional(),
  cellH: z.number().min(28).max(120).default(46),
  headerFill: hex.optional(),
});

/* ── HIGHLIGHT ────────────────────────────────────────────────────── */
export const highlightCommand = z
  .object({
    op: z.literal('HIGHLIGHT'),
    id: id.optional(),
    /** Id of an existing element to emphasize. */
    target: id.optional(),
    /** Or an explicit region of the board. */
    region: z
      .object({ x: coord, y: coord, w: z.number().min(4).max(2400), h: z.number().min(4).max(2400) })
      .optional(),
    mode: z.enum(['wash', 'underline', 'box', 'circle']).default('wash'),
    color: hex.optional(),
    label: z.string().max(60).optional(),
  })
  .refine((v) => Boolean(v.target || v.region), {
    message: 'HIGHLIGHT needs a target element id or a region',
  });

/* ── ERASE / GROUP / MOVE ─────────────────────────────────────────── */
export const eraseCommand = z.object({
  op: z.literal('ERASE'),
  target: z.union([id, z.literal('last'), z.literal('all')]),
});

export const groupCommand = z.object({
  op: z.literal('GROUP'),
  ids: z.array(id).min(1).max(60),
  dx: coord.default(0),
  dy: coord.default(0),
});

export const moveCommand = z.object({
  op: z.literal('MOVE'),
  target: id,
  dx: coord.default(0),
  dy: coord.default(0),
});

/* ── Union + parsing ──────────────────────────────────────────────── */
export const drawCommandSchema = z.discriminatedUnion('op', [
  textCommand,
  mathCommand,
  codeCommand,
  lineCommand,
  arrowCommand,
  circleCommand,
  rectangleCommand,
  flowchartCommand,
  tableCommand,
  highlightCommand,
  eraseCommand,
  groupCommand,
  moveCommand,
]);

export type DrawCommand = z.infer<typeof drawCommandSchema>;
export type DrawCommandOp = DrawCommand['op'];

export const DRAW_COMMAND_OPS: readonly DrawCommandOp[] = [
  'TEXT',
  'MATH',
  'CODE',
  'LINE',
  'ARROW',
  'CIRCLE',
  'RECTANGLE',
  'FLOWCHART',
  'TABLE',
  'HIGHLIGHT',
  'ERASE',
  'GROUP',
  'MOVE',
];

/** Parse a single command; returns null when the command is invalid. */
export function parseDrawCommand(input: unknown): DrawCommand | null {
  const parsed = drawCommandSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

/** Parse a batch, silently dropping anything that fails validation. */
export function parseDrawCommands(input: unknown): DrawCommand[] {
  if (!Array.isArray(input)) return [];
  const out: DrawCommand[] = [];
  for (const item of input) {
    const parsed = parseDrawCommand(item);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** Bounding box of a command's visual footprint (used for hit-testing,
 *  selection and target-based HIGHLIGHT). Coordinates in board space. */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rough text width estimate — good enough for hit boxes and highlights. */
export function estimateTextWidth(text: string, size: number): number {
  let units = 0;
  for (const ch of text) {
    // Arabic joins and wide glyphs run wider than latin; approximations only.
    units += /[A-Za-z0-9]/.test(ch) ? 0.55 : ch === ' ' ? 0.3 : 0.72;
  }
  return Math.max(size * 0.6, units * size);
}

export function commandBBox(cmd: DrawCommand): BBox | null {
  switch (cmd.op) {
    case 'TEXT': {
      const w = estimateTextWidth(cmd.text, cmd.size);
      const anchorShift = cmd.anchor === 'middle' ? -w / 2 : cmd.anchor === 'end' ? -w : 0;
      return { x: cmd.x + anchorShift, y: cmd.y - cmd.size, w, h: cmd.size * 1.4 };
    }
    case 'MATH': {
      const w = Math.min(900, cmd.latex.length * cmd.size * 0.42);
      return { x: cmd.x, y: cmd.y - cmd.size, w, h: cmd.size * 1.7 };
    }
    case 'CODE': {
      // Monospace: every glyph (Latin, digit, punctuation) is ~0.6em wide.
      const w = Math.max(cmd.size * 0.6, cmd.text.length * cmd.size * 0.62);
      return { x: cmd.x, y: cmd.y - cmd.size, w, h: cmd.size * 1.5 };
    }
    case 'LINE':
    case 'ARROW':
      return {
        x: Math.min(cmd.x1, cmd.x2) - 6,
        y: Math.min(cmd.y1, cmd.y2) - 6,
        w: Math.abs(cmd.x2 - cmd.x1) + 12,
        h: Math.abs(cmd.y2 - cmd.y1) + 12,
      };
    case 'CIRCLE':
      return { x: cmd.cx - cmd.r, y: cmd.cy - cmd.r, w: cmd.r * 2, h: cmd.r * 2 };
    case 'RECTANGLE':
      return { x: cmd.x, y: cmd.y, w: cmd.w, h: cmd.h };
    case 'TABLE': {
      const h = cmd.cellH * (cmd.rows.length + 1);
      return { x: cmd.x, y: cmd.y, w: cmd.width, h };
    }
    case 'FLOWCHART': {
      // Flowcharts lay out downwards/rightwards from their anchor; the exact
      // box depends on the layout pass, so estimate from node count.
      const n = cmd.nodes.length;
      if (cmd.direction === 'TB') {
        return {
          x: cmd.x - 40,
          y: cmd.y,
          w: cmd.nodeW + 80,
          h: n * (cmd.nodeH + cmd.gap),
        };
      }
      return {
        x: cmd.x,
        y: cmd.y - 40,
        w: n * (cmd.nodeW + cmd.gap),
        h: cmd.nodeH + 80,
      };
    }
    case 'HIGHLIGHT':
      if (cmd.region) return cmd.region;
      return null; // resolved against the target element by the renderer
    case 'ERASE':
    case 'GROUP':
    case 'MOVE':
      return null;
    default:
      return null;
  }
}