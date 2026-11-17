/**
 * Hand-drawn stroke generators.
 *
 * Every shape the AI can ask for is re-drawn as a slightly wobbling marker
 * stroke instead of a perfect geometric primitive. All randomness is seeded
 * from a stable key, so an element looks identical on every re-render — the
 * wobble is part of the artwork, not noise.
 */

/** FNV-1a: turn any stable key into a 32-bit seed. */
export function hashKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 — small, fast, deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rng(key: string): () => number {
  return mulberry32(hashKey(key));
}

const n = (v: number) => Math.round(v * 10) / 10;

/**
 * A bowed, slightly shaky line. The control points bow perpendicular to the
 * stroke (the way a hand drags a marker) and each endpoint gets a sub-pixel
 * tremor so no two strokes share a perfectly straight edge.
 */
export function handLine(x1: number, y1: number, x2: number, y2: number, key: string): string {
  const r = rng(key);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bow = (r() - 0.5) * Math.min(16, len * 0.06);
  const j = () => (r() - 0.5) * 3;

  const c1x = x1 + dx * 0.33 + nx * bow + j();
  const c1y = y1 + dy * 0.33 + ny * bow + j();
  const c2x = x1 + dx * 0.66 + nx * bow * 0.7 + j();
  const c2y = y1 + dy * 0.66 + ny * bow * 0.7 + j();

  return `M ${n(x1 + j())} ${n(y1 + j())} C ${n(c1x)} ${n(c1y)}, ${n(c2x)} ${n(c2y)}, ${n(x2 + j())} ${n(y2 + j())}`;
}

/** A shaky rectangle drawn as one continuous marker stroke with a corner
 *  overshoot — the tell-tale sign of a hand-drawn box. */
export function handRect(x: number, y: number, w: number, h: number, key: string): string {
  const r = rng(key);
  const j = () => (r() - 0.5) * 3.4;
  const over = 2 + r() * 4; // how far the last corner overshoots the start
  const p = (px: number, py: number) => `${n(px + j())} ${n(py + j())}`;

  return [
    `M ${p(x, y)}`,
    `L ${p(x + w, y)}`,
    `L ${p(x + w, y + h)}`,
    `L ${p(x, y + h)}`,
    `L ${n(x + j() + over)} ${n(y + j() + over * 0.6)}`,
  ].join(' ');
}

/** A hand-drawn ellipse: two arcs, each with its own radius tremor, so the
 *  closing seam is visible like a real pen stroke. */
export function handEllipse(cx: number, cy: number, rx: number, ry: number, key: string): string {
  const r = rng(key);
  const w1 = 1 + (r() - 0.5) * 0.07;
  const w2 = 1 + (r() - 0.5) * 0.07;
  const h1 = 1 + (r() - 0.5) * 0.07;
  const h2 = 1 + (r() - 0.5) * 0.07;
  const ox = (r() - 0.5) * 3;
  const oy = (r() - 0.5) * 3;

  const a1x = cx + rx * w1 + ox;
  const a1y = cy + ry * h1 + oy;
  const a2x = cx - rx * w2 + ox;
  const a2y = cy - ry * h2 + oy;

  return [
    `M ${n(a1x)} ${n(a1y)}`,
    `C ${n(cx + rx * w1)} ${n(cy - ry * 1.12)}, ${n(cx - rx * 1.12)} ${n(cy - ry * h2)}, ${n(a2x)} ${n(a2y)}`,
    `C ${n(cx - rx * w2)} ${n(cy + ry * 1.12)}, ${n(cx + rx * 1.12)} ${n(cy + ry * h1)}, ${n(a1x)} ${n(a1y)}`,
  ].join(' ');
}

/** A hand-drawn arrow head — two shaky barbs meeting at the tip. */
export function handArrowHead(
  x: number,
  y: number,
  fromX: number,
  fromY: number,
  size: number,
  key: string,
): string {
  const r = rng(key);
  const angle = Math.atan2(y - fromY, x - fromX);
  const spread = 0.46 + (r() - 0.5) * 0.12;
  const j = () => (r() - 0.5) * 2.4;

  const left = angle + Math.PI - spread;
  const right = angle + Math.PI + spread;
  const lx = x + Math.cos(left) * size + j();
  const ly = y + Math.sin(left) * size + j();
  const rx = x + Math.cos(right) * size + j();
  const ry = y + Math.sin(right) * size + j();

  return `M ${n(lx)} ${n(ly)} L ${n(x + j())} ${n(y + j())} L ${n(rx)} ${n(ry)}`;
}

/** Diamond (flowchart decision) as one shaky stroke. */
export function handDiamond(x: number, y: number, w: number, h: number, key: string): string {
  const r = rng(key);
  const j = () => (r() - 0.5) * 3;
  const mx = x + w / 2;
  const my = y + h / 2;
  return [
    `M ${n(mx + j())} ${n(my - h / 2 + j())}`,
    `L ${n(x + w + j())} ${n(my + j())}`,
    `L ${n(mx + j())} ${n(y + h + j())}`,
    `L ${n(x + j())} ${n(my + j())}`,
    `L ${n(mx + j())} ${n(my - h / 2 + j())}`,
  ].join(' ');
}

/** Stadium / pill (flowchart terminator) as one shaky stroke. */
export function handStadium(x: number, y: number, w: number, h: number, key: string): string {
  const r = rng(key);
  const rad = h / 2;
  const j = () => (r() - 0.5) * 2.6;
  return [
    `M ${n(x + rad + j())} ${n(y + j())}`,
    `L ${n(x + w - rad + j())} ${n(y + j())}`,
    `A ${n(rad)} ${n(rad)} 0 0 1 ${n(x + w + j())} ${n(y + rad + j())}`,
    `A ${n(rad)} ${n(rad)} 0 0 1 ${n(x + w - rad + j())} ${n(y + h + j())}`,
    `L ${n(x + rad + j())} ${n(y + h + j())}`,
    `A ${n(rad)} ${n(rad)} 0 0 1 ${n(x + j())} ${n(y + rad + j())}`,
    `A ${n(rad)} ${n(rad)} 0 0 1 ${n(x + rad + j())} ${n(y + j())}`,
  ].join(' ');
}

/**
 * Curved connector between two boxes (flowchart edges): bows away from the
 * axis it connects, like a hand arcing between two nodes.
 */
export function handCurve(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  key: string,
): string {
  const r = rng(key);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const bow = (0.12 + r() * 0.1) * Math.hypot(dx, dy) * (r() > 0.5 ? 1 : -1);
  const nx = -dy / (Math.hypot(dx, dy) || 1);
  const ny = dx / (Math.hypot(dx, dy) || 1);
  const j = () => (r() - 0.5) * 2.5;
  const mx = (x1 + x2) / 2 + nx * bow;
  const my = (y1 + y2) / 2 + ny * bow;
  return `M ${n(x1 + j())} ${n(y1 + j())} Q ${n(mx)} ${n(my)}, ${n(x2 + j())} ${n(y2 + j())}`;
}