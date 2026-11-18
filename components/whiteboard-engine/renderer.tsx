'use client';

/**
 * SVG renderer for the Drawing DSL.
 *
 * Converts validated DrawCommands into hand-drawn SVG strokes. Progressive
 * rendering is a pure function of `revealed`: the player reveals elements in
 * speech order, this component only draws what is visible and lets AnimatePresence
 * retire what the teacher erased.
 *
 * Nothing here makes a teaching decision — it renders what it is told.
 */
import { AnimatePresence, motion } from 'motion/react';
import katex from 'katex';
import { useMemo } from 'react';

import type { BoardElement } from '@/lib/whiteboard-engine/board-store';
import { resolveBBox } from '@/lib/whiteboard-engine/board-store';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PALETTE,
  commandBBox,
  type BBox,
  type DrawCommand,
} from '@/lib/whiteboard-engine/dsl';
import {
  handArrowHead,
  handCurve,
  handDiamond,
  handEllipse,
  handLine,
  handRect,
  handStadium,
} from '@/lib/whiteboard-engine/hand-drawn';

const INK = PALETTE.ink;
const PURPLE = PALETTE.purple;
const VIOLET = PALETTE.violet;
const YELLOW = PALETTE.yellow;

const BOARD_FONT = "'Caveat', 'Aref Ruqaa', 'Cairo', sans-serif";

interface RendererProps {
  elements: BoardElement[];
  selectedId?: string | null;
  /** The board can grow taller as lessons stack; default is one full board. */
  worldHeight?: number;
  onElementPointerDown?: (event: React.PointerEvent, elementId: string) => void;
  onBackgroundPointerDown?: (event: React.PointerEvent) => void;
}

/** Naive width-aware wrap — enough for board labels and table cells. */
function wrapText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

/* ── Flowchart layout ─────────────────────────────────────────────── */
interface FlowLayout {
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
}

function layoutFlowchart(cmd: Extract<DrawCommand, { op: 'FLOWCHART' }>): FlowLayout {
  const { nodes, edges, direction, nodeW, nodeH, gap } = cmd;

  // Longest-path layering (Kahn) so branches sit on their own row/column.
  const indeg = new Map<string, number>();
  const layer = new Map<string, number>();
  nodes.forEach((n) => {
    indeg.set(n.id, 0);
    layer.set(n.id, 0);
  });
  edges.forEach((e) => {
    if (indeg.has(e.to)) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  });

  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const settled = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift() as string;
    settled.add(id);
    const nextLayer = (layer.get(id) ?? 0) + 1;
    edges
      .filter((e) => e.from === id)
      .forEach((e) => {
        if (!layer.has(e.to)) return;
        layer.set(e.to, Math.max(layer.get(e.to) ?? 0, nextLayer));
        const remaining = (indeg.get(e.to) ?? 1) - 1;
        indeg.set(e.to, remaining);
        if (remaining === 0 && !settled.has(e.to)) queue.push(e.to);
      });
  }
  // Cycles / unreachable nodes fall back to the first row.
  nodes.forEach((n) => {
    if (!settled.has(n.id)) layer.set(n.id, layer.get(n.id) ?? 0);
  });

  const byLayer = new Map<number, string[]>();
  nodes.forEach((n) => {
    const l = layer.get(n.id) ?? 0;
    const bucket = byLayer.get(l);
    if (bucket) bucket.push(n.id);
    else byLayer.set(l, [n.id]);
  });
  const layers = [...byLayer.keys()].sort((a, b) => a - b);

  const positions = new Map<string, { x: number; y: number }>();

  if (direction === 'TB') {
    const maxCols = Math.max(...layers.map((l) => (byLayer.get(l) ?? []).length));
    const totalW = maxCols * nodeW + (maxCols - 1) * gap;
    const originX = cmd.x + totalW / 2;
    layers.forEach((l, row) => {
      const ids = byLayer.get(l) ?? [];
      const rowW = ids.length * nodeW + (ids.length - 1) * gap;
      const startX = originX - rowW / 2;
      ids.forEach((id, col) => {
        positions.set(id, {
          x: startX + col * (nodeW + gap),
          y: cmd.y + row * (nodeH + gap),
        });
      });
    });
    return {
      positions,
      width: totalW,
      height: layers.length * nodeH + Math.max(0, layers.length - 1) * gap,
    };
  }

  const maxRows = Math.max(...layers.map((l) => (byLayer.get(l) ?? []).length));
  const totalH = maxRows * nodeH + (maxRows - 1) * gap;
  const originY = cmd.y + totalH / 2;
  layers.forEach((l, col) => {
    const ids = byLayer.get(l) ?? [];
    const colH = ids.length * nodeH + (ids.length - 1) * gap;
    const startY = originY - colH / 2;
    ids.forEach((id, row) => {
      positions.set(id, {
        x: cmd.x + col * (nodeW + gap),
        y: startY + row * (nodeH + gap),
      });
    });
  });
  return {
    positions,
    width: layers.length * nodeW + Math.max(0, layers.length - 1) * gap,
    height: totalH,
  };
}

/* ── Shared pieces ────────────────────────────────────────────────── */
function TextLines({
  lines,
  x,
  y,
  size,
  fill,
  anchor = 'middle',
  weight = 400,
}: {
  lines: string[];
  x: number;
  y: number;
  size: number;
  fill: string;
  anchor?: 'start' | 'middle' | 'end';
  weight?: number;
}) {
  const lineHeight = size * 1.3;
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  return (
    <text
      x={x}
      y={startY}
      fill={fill}
      fontSize={size}
      fontWeight={weight}
      textAnchor={anchor}
      style={{ direction: 'ltr', fontFamily: BOARD_FONT, paintOrder: 'stroke' }}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function StrokePath({
  d,
  color,
  width,
  style = 'solid',
  className = 'wb-draw-stroke',
}: {
  d: string;
  color: string;
  width: number;
  style?: 'solid' | 'dashed' | 'dotted';
  className?: string;
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength={1}
      strokeDasharray={style === 'solid' ? undefined : style === 'dashed' ? '0.06 0.04' : '0.02 0.05'}
      className={style === 'solid' ? className : undefined}
    />
  );
}

/* ── Per-command renderers ────────────────────────────────────────── */
function renderCommand(
  cmd: DrawCommand,
  elements: BoardElement[],
  key: string,
): React.ReactNode {
  switch (cmd.op) {
    case 'TEXT':
      return (
        <motion.g
          key={key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.45, ease: [0.215, 0.61, 0.355, 1] }}
        >
          {/* rotation lives on an inner plain <g>: motion owns the wrapper's transform */}
          <g transform={cmd.rotate ? `rotate(${cmd.rotate} ${cmd.x} ${cmd.y})` : undefined}>
            <text
              x={cmd.x}
              y={cmd.y}
              fill={cmd.color ?? INK}
              fontSize={cmd.size}
              fontWeight={cmd.weight}
              textAnchor={cmd.anchor}
              style={{ direction: 'ltr', fontFamily: BOARD_FONT }}
            >
              {cmd.text}
            </text>
          </g>
        </motion.g>
      );

    case 'MATH': {
      // Rendered inline (no hook): KaTeX is pure and boards hold few formulas.
      const html = katex.renderToString(cmd.latex, {
        displayMode: cmd.display,
        throwOnError: false,
      });
      const width = Math.max(160, cmd.latex.length * cmd.size * 0.6);
      const height = cmd.size * (cmd.display ? 2.6 : 1.9);
      return (
        <motion.g
          key={key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.45, ease: [0.215, 0.61, 0.355, 1] }}
        >
          <foreignObject
            x={cmd.x}
            y={cmd.y - cmd.size}
            width={width}
            height={height}
            style={{ color: cmd.color ?? PURPLE, overflow: 'visible' }}
          >
            <div
              // KaTeX sanitizes its own output (trust: false by default)
              dangerouslySetInnerHTML={{ __html: html }}
              style={{
                fontSize: `${cmd.size}px`,
                direction: 'ltr',
                textAlign: cmd.display ? 'center' : 'left',
              }}
            />
          </foreignObject>
        </motion.g>
      );
    }

    case 'LINE':
      return (
        <motion.g
          key={key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 0.15 }}
        >
          <StrokePath
            d={handLine(cmd.x1, cmd.y1, cmd.x2, cmd.y2, key)}
            color={cmd.color ?? INK}
            width={cmd.width}
            style={cmd.style}
          />
        </motion.g>
      );

    case 'ARROW': {
      const d = cmd.curve
        ? handCurve(cmd.x1, cmd.y1, cmd.x2, cmd.y2, key)
        : handLine(cmd.x1, cmd.y1, cmd.x2, cmd.y2, key);
      const headSize = 14 + cmd.width * 2.2;
      const back = cmd.double
        ? handArrowHead(cmd.x1, cmd.y1, cmd.x2, cmd.y2, headSize, `${key}b`)
        : null;
      return (
        <motion.g
          key={key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 0.15 }}
        >
          <StrokePath
            d={d}
            color={cmd.color ?? INK}
            width={cmd.width}
            style={cmd.style}
          />
          <path
            d={handArrowHead(cmd.x2, cmd.y2, cmd.x1, cmd.y1, headSize, `${key}a`)}
            fill="none"
            stroke={cmd.color ?? INK}
            strokeWidth={cmd.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            className="wb-draw-stroke"
          />
          {back ? (
            <path
              d={back}
              fill="none"
              stroke={cmd.color ?? INK}
              strokeWidth={cmd.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              className="wb-draw-stroke"
            />
          ) : null}
        </motion.g>
      );
    }

    case 'CIRCLE': {
      const stroke = cmd.stroke ?? PURPLE;
      return (
        <motion.g
          key={key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 0.15 }}
        >
          <path
            d={handEllipse(cmd.cx, cmd.cy, cmd.r, cmd.r, key)}
            fill={cmd.fill === 'none' ? 'none' : cmd.fill}
            fillOpacity={cmd.fill === 'none' ? 0 : 0.14}
            stroke={stroke}
            strokeWidth={cmd.strokeWidth}
            strokeLinecap="round"
            pathLength={1}
            className="wb-draw-stroke"
          />
          {cmd.label ? (
            <TextLines
              lines={wrapText(cmd.label, Math.floor(cmd.r / (cmd.labelSize * 0.3)))}
              x={cmd.cx}
              y={cmd.cy}
              size={cmd.labelSize}
              fill={INK}
            />
          ) : null}
        </motion.g>
      );
    }

    case 'RECTANGLE': {
      const stroke = cmd.stroke ?? PURPLE;
      return (
        <motion.g
          key={key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 0.15 }}
        >
          <path
            d={handRect(cmd.x, cmd.y, cmd.w, cmd.h, key)}
            fill={cmd.fill === 'none' ? 'none' : cmd.fill}
            fillOpacity={cmd.fill === 'none' ? 0 : 0.14}
            stroke={stroke}
            strokeWidth={cmd.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            className="wb-draw-stroke"
          />
          {cmd.label ? (
            <TextLines
              lines={wrapText(cmd.label, Math.floor(cmd.w / (cmd.labelSize * 0.32)))}
              x={cmd.x + cmd.w / 2}
              y={cmd.y + cmd.h / 2}
              size={cmd.labelSize}
              fill={INK}
            />
          ) : null}
        </motion.g>
      );
    }

    case 'FLOWCHART': {
      const layout = layoutFlowchart(cmd);
      const stroke = cmd.stroke ?? PURPLE;

      const edges = cmd.edges.map((edge, i) => {
        const from = layout.positions.get(edge.from);
        const to = layout.positions.get(edge.to);
        if (!from || !to) return null;
        const forward = cmd.direction === 'TB';
        const x1 = forward ? from.x + cmd.nodeW / 2 : from.x + cmd.nodeW;
        const y1 = forward ? from.y + cmd.nodeH : from.y + cmd.nodeH / 2;
        const x2 = forward ? to.x + cmd.nodeW / 2 : to.x;
        const y2 = forward ? to.y : to.y + cmd.nodeH / 2;
        return (
          <g key={`e${i}`}>
            <path
              d={handLine(x1, y1, x2, y2, `${key}e${i}`)}
              fill="none"
              stroke={VIOLET}
              strokeWidth={2.6}
              strokeLinecap="round"
              pathLength={1}
              className="wb-draw-stroke"
            />
            <path
              d={handArrowHead(x2, y2, x1, y1, 12, `${key}ea${i}`)}
              fill="none"
              stroke={VIOLET}
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {edge.label ? (
              <TextLines
                lines={[edge.label]}
                x={(x1 + x2) / 2}
                y={(y1 + y2) / 2 - 8}
                size={15}
                fill={VIOLET}
              />
            ) : null}
          </g>
        );
      });

      const nodes = cmd.nodes.map((node, i) => {
        const pos = layout.positions.get(node.id);
        if (!pos) return null;
        const shapeKey = `${key}n${i}`;
        const lines = wrapText(node.label, Math.floor(cmd.nodeW / (14 * 0.5)));
        const cx = pos.x + cmd.nodeW / 2;
        const cy = pos.y + cmd.nodeH / 2;
        let shape: React.ReactNode;
        if (node.kind === 'diamond') {
          shape = (
            <path
              d={handDiamond(pos.x, pos.y, cmd.nodeW, cmd.nodeH, shapeKey)}
              fill={cmd.fill === 'none' ? '#FFFFFF' : cmd.fill}
              fillOpacity={cmd.fill === 'none' ? 0.75 : 0.16}
              stroke={stroke}
              strokeWidth={2.8}
              strokeLinejoin="round"
              pathLength={1}
              className="wb-draw-stroke"
            />
          );
        } else if (node.kind === 'ellipse') {
          shape = (
            <path
              d={handEllipse(cx, cy, cmd.nodeW / 2, cmd.nodeH / 2, shapeKey)}
              fill={cmd.fill === 'none' ? '#FFFFFF' : cmd.fill}
              fillOpacity={cmd.fill === 'none' ? 0.75 : 0.16}
              stroke={stroke}
              strokeWidth={2.8}
              pathLength={1}
              className="wb-draw-stroke"
            />
          );
        } else if (node.kind === 'stadium') {
          shape = (
            <path
              d={handStadium(pos.x, pos.y, cmd.nodeW, cmd.nodeH, shapeKey)}
              fill={cmd.fill === 'none' ? '#FFFFFF' : cmd.fill}
              fillOpacity={cmd.fill === 'none' ? 0.75 : 0.16}
              stroke={stroke}
              strokeWidth={2.8}
              strokeLinejoin="round"
              pathLength={1}
              className="wb-draw-stroke"
            />
          );
        } else {
          shape = (
            <path
              d={handRect(pos.x, pos.y, cmd.nodeW, cmd.nodeH, shapeKey)}
              fill={cmd.fill === 'none' ? '#FFFFFF' : cmd.fill}
              fillOpacity={cmd.fill === 'none' ? 0.75 : 0.16}
              stroke={stroke}
              strokeWidth={2.8}
              strokeLinejoin="round"
              pathLength={1}
              className="wb-draw-stroke"
            />
          );
        }
        return (
          <g key={node.id}>
            {shape}
            <TextLines
              lines={lines}
              x={cx}
              y={cy}
              size={14}
              fill={INK}
              weight={700}
            />
          </g>
        );
      });

      return (
        <motion.g
          key={key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          {edges}
          {nodes}
        </motion.g>
      );
    }

    case 'TABLE': {
      const colCount = cmd.headers.length;
      const widths = (() => {
        if (cmd.colWidths && cmd.colWidths.length === colCount) {
          const sum = cmd.colWidths.reduce((a, b) => a + b, 0) || 1;
          return cmd.colWidths.map((w) => (w / sum) * cmd.width);
        }
        return Array.from({ length: colCount }, () => cmd.width / colCount);
      })();
      const totalH = cmd.cellH * (cmd.rows.length + 1);
      const headerFill = cmd.headerFill ?? PURPLE;

      const colX: number[] = [];
      let acc = cmd.x;
      widths.forEach((w) => {
        colX.push(acc);
        acc += w;
      });

      const gridLines: React.ReactNode[] = [];
      for (let r = 0; r <= cmd.rows.length; r += 1) {
        const y = cmd.y + r * cmd.cellH;
        gridLines.push(
          <path
            key={`h${r}`}
            d={handLine(cmd.x, y, cmd.x + cmd.width, y, `${key}h${r}`)}
            fill="none"
            stroke={INK}
            strokeWidth={r === 1 ? 2.6 : 1.8}
            pathLength={1}
            className="wb-draw-stroke"
          />,
        );
      }
      let cx = cmd.x;
      for (let c = 0; c <= colCount; c += 1) {
        gridLines.push(
          <path
            key={`v${c}`}
            d={handLine(cx, cmd.y, cx, cmd.y + totalH, `${key}v${c}`)}
            fill="none"
            stroke={INK}
            strokeWidth={1.8}
            pathLength={1}
            className="wb-draw-stroke"
          />,
        );
        cx += widths[c] ?? 0;
      }

      const headerCells = cmd.headers.map((h, c) => (
        <TextLines
          key={`th${c}`}
          lines={[h]}
          x={colX[c] + widths[c] / 2}
          y={cmd.y + cmd.cellH / 2}
          size={17}
          fill="#FFFFFF"
          weight={700}
        />
      ));

      const bodyCells = cmd.rows.flatMap((row, r) =>
        row.map((cell, c) => (
          <TextLines
            key={`td${r}-${c}`}
            lines={wrapText(cell, Math.floor((widths[c] ?? 100) / 9))}
            x={colX[c] + (widths[c] ?? 0) / 2}
            y={cmd.y + cmd.cellH * (r + 1.5)}
            size={15}
            fill={INK}
          />
        )),
      );

      return (
        <motion.g
          key={key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 0.15 }}
        >
          <rect
            x={cmd.x}
            y={cmd.y}
            width={cmd.width}
            height={cmd.cellH}
            fill={headerFill}
            opacity={0.92}
          />
          <rect
            x={cmd.x}
            y={cmd.y + cmd.cellH}
            width={cmd.width}
            height={cmd.rows.length * cmd.cellH}
            fill="#FFFFFF"
            opacity={0.6}
          />
          {gridLines}
          {headerCells}
          {bodyCells}
        </motion.g>
      );
    }

    case 'HIGHLIGHT': {
      const region: BBox | null = cmd.region
        ? cmd.region
        : cmd.target
          ? resolveBBox(elements, cmd.target)
          : null;
      if (!region) return null;
      const color = cmd.color ?? YELLOW;

      if (cmd.mode === 'wash') {
        return (
          <motion.g key={key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <rect
              x={region.x - 6}
              y={region.y - 3}
              width={region.w + 12}
              height={region.h + 6}
              rx={8}
              fill={color}
              opacity={0.32}
              style={{ mixBlendMode: 'multiply' }}
            />
          </motion.g>
        );
      }
      if (cmd.mode === 'circle') {
        return (
          <motion.g key={key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <path
              d={handEllipse(
                region.x + region.w / 2,
                region.y + region.h / 2,
                region.w / 2 + 14,
                region.h / 2 + 10,
                key,
              )}
              fill="none"
              stroke={color}
              strokeWidth={4}
              pathLength={1}
              className="wb-draw-stroke"
            />
          </motion.g>
        );
      }
      if (cmd.mode === 'box') {
        return (
          <motion.g key={key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <path
              d={handRect(region.x - 8, region.y - 6, region.w + 16, region.h + 12, key)}
              fill="none"
              stroke={color}
              strokeWidth={4}
              strokeLinejoin="round"
              pathLength={1}
              className="wb-draw-stroke"
            />
          </motion.g>
        );
      }
      // underline
      const y = region.y + region.h + 4;
      return (
        <motion.g key={key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <path
            d={handLine(region.x - 4, y, region.x + region.w + 4, y, key)}
            fill="none"
            stroke={color}
            strokeWidth={5}
            strokeLinecap="round"
            pathLength={1}
            className="wb-draw-stroke"
          />
        </motion.g>
      );
    }

    // Structural commands never render — the store already applied them.
    case 'ERASE':
    case 'GROUP':
    case 'MOVE':
      return null;
    default:
      return null;
  }
}

/* ── Component ────────────────────────────────────────────────────── */
export function WhiteboardRenderer({
  elements,
  selectedId,
  worldHeight = BOARD_HEIGHT,
  onElementPointerDown,
  onBackgroundPointerDown,
}: RendererProps) {
  const visible = useMemo(() => elements.filter((el) => el.revealed), [elements]);
  const washKeys = useMemo(
    () =>
      new Set(
        visible
          .filter((el) => el.cmd.op === 'HIGHLIGHT' && el.cmd.mode === 'wash')
          .map((el) => el.id),
      ),
    [visible],
  );

  const washes = visible.filter((el) => washKeys.has(el.id));
  const rest = visible.filter((el) => !washKeys.has(el.id));

  const renderEntry = (el: BoardElement) => {
    const bbox = commandBBox(el.cmd) ?? resolveBBox(elements, el.id);
    const isSelected = selectedId === el.id;
    return (
      <motion.g
        key={el.id}
        initial={false}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.22 } }}
        onPointerDown={(event) => onElementPointerDown?.(event, el.id)}
        style={{ cursor: onElementPointerDown ? 'grab' : undefined }}
      >
        {renderCommand(el.cmd, elements, el.id)}
        {/* generous transparent hit area so thin strokes stay clickable */}
        {bbox && onElementPointerDown ? (
          <rect
            x={bbox.x - 4}
            y={bbox.y - 4}
            width={bbox.w + 8}
            height={bbox.h + 8}
            fill="transparent"
            stroke="none"
          />
        ) : null}
        {isSelected && bbox ? (
          <g pointerEvents="none">
            <rect
              x={bbox.x - 8}
              y={bbox.y - 8}
              width={bbox.w + 16}
              height={bbox.h + 16}
              rx={8}
              fill="none"
              stroke={PURPLE}
              strokeWidth={2}
              strokeDasharray="7 6"
              opacity={0.9}
            />
            <circle cx={bbox.x - 8} cy={bbox.y - 8} r={5} fill={PURPLE} />
            <circle cx={bbox.x + bbox.w + 8} cy={bbox.y - 8} r={5} fill={PURPLE} />
            <circle cx={bbox.x - 8} cy={bbox.y + bbox.h + 8} r={5} fill={PURPLE} />
            <circle cx={bbox.x + bbox.w + 8} cy={bbox.y + bbox.h + 8} r={5} fill={PURPLE} />
          </g>
        ) : null}
      </motion.g>
    );
  };

  return (
    <svg
      viewBox={`0 0 ${BOARD_WIDTH} ${worldHeight}`}
      className="absolute inset-0 h-full w-full select-none"
      style={{ touchAction: 'none' }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onBackgroundPointerDown?.(event);
      }}
    >
      {/* wash highlights live behind everything they emphasize */}
      <AnimatePresence>{washes.map(renderEntry)}</AnimatePresence>
      <AnimatePresence>{rest.map(renderEntry)}</AnimatePresence>
    </svg>
  );
}