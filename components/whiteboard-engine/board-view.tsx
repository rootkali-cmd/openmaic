'use client';

/**
 * Board view — the camera around the SVG renderer.
 *
 * The board is a fixed-width world that grows taller as lessons stack. The
 * sheet is scaled to COVER the section, so no unused margin shows, and the
 * student pans it themselves (drag anywhere, or wheel / trackpad). Board
 * content never re-lays-out: every element keeps its authored coordinates;
 * only the camera moves.
 *
 * Follow mode is the AI's camera: while it is on, each freshly revealed
 * element gently pulls the view so the teacher's chalk stays on screen.
 * Grabbing or wheeling the board turns follow off, so the student is never
 * fought over the viewport.
 *
 * A pen cursor rides at the end of the newest stroke so the board reads as
 * the teacher writing by hand rather than elements popping into place.
 */
import { Eraser, Pencil, Redo2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { WhiteboardRenderer } from '@/components/whiteboard-engine/renderer';
import { useI18n } from '@/lib/hooks/use-i18n';
import { resolveBBox, useBoardStore } from '@/lib/whiteboard-engine/board-store';
import { BOARD_HEIGHT, BOARD_WIDTH } from '@/lib/whiteboard-engine/dsl';
import { usePlayerStore } from '@/lib/whiteboard-engine/player';

interface View {
  scale: number;
  tx: number;
  ty: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Cover the section: scale so the sheet never leaves an unused strip. */
function coverView(cw: number, ch: number, worldH: number): View {
  const scale = Math.max(cw / BOARD_WIDTH, ch / worldH);
  return { scale, tx: 0, ty: 0 };
}

/** Keep the sheet covering the viewport while the student pans. */
function clampView(view: View, cw: number, ch: number, worldH: number): View {
  const minTx = Math.min(0, cw - BOARD_WIDTH * view.scale);
  const minTy = Math.min(0, ch - worldH * view.scale);
  return {
    scale: view.scale,
    tx: clamp(view.tx, minTx, 0),
    ty: clamp(view.ty, minTy, 0),
  };
}

export function BoardView() {
  const { t } = useI18n();
  const elements = useBoardStore((s) => s.elements);
  const follow = usePlayerStore((s) => s.follow);
  const revealSeq = usePlayerStore((s) => s.revealSeq);
  const lastRevealedId = usePlayerStore((s) => s.lastRevealedId);
  const status = usePlayerStore((s) => s.status);

  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const [smooth, setSmooth] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  const sizeRef = useRef({ w: 0, h: 0 });
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null);

  const canUndo = useBoardStore((s) => s.past.length > 0);
  const canRedo = useBoardStore((s) => s.future.length > 0);

  /* The world grows downward as lessons stack so the student can always
     scroll/pull the newest content into view. */
  let contentBottom = 0;
  for (const el of elements) {
    const box = resolveBBox(elements, el.id);
    if (box) contentBottom = Math.max(contentBottom, box.y + box.h);
  }
  const worldH = Math.max(BOARD_HEIGHT, Math.ceil(contentBottom + 180));
  const worldRef = useRef(worldH);
  worldRef.current = worldH;

  /* ── measure the section and cover it ─────────────────────────────── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const apply = () => {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;
      sizeRef.current = { w: cw, h: ch };
      setSmooth(false);
      setView((current) => {
        // Preserve the student's zoom/pan intent on resize, but re-cover
        // if the sheet no longer fills the section.
        const covered = coverView(cw, ch, worldRef.current);
        if (current.scale < covered.scale) return covered;
        return clampView(current, cw, ch, worldRef.current);
      });
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  /* ── follow the teacher's chalk (only when follow is on) ──────────── */
  useEffect(() => {
    if (!follow || !lastRevealedId || status === 'idle') return;
    const { w: cw, h: ch } = sizeRef.current;
    if (!cw || !ch) return;
    const bbox = resolveBBox(elements, lastRevealedId);
    if (!bbox) return;

    const current = viewRef.current;
    const cx = (bbox.x + bbox.w / 2) * current.scale;
    const cy = (bbox.y + bbox.h / 2) * current.scale;
    const screenX = current.tx + cx;
    const screenY = current.ty + cy;

    let { tx, ty } = current;
    // Keep the chalk inside a comfortable band; pull only when it drifts out.
    if (screenX < cw * 0.22 || screenX > cw * 0.78) tx = cw / 2 - cx;
    if (screenY < ch * 0.24 || screenY > ch * 0.72) ty = ch * 0.42 - cy;

    const next = clampView({ scale: current.scale, tx, ty }, cw, ch, worldRef.current);
    if (next.tx !== current.tx || next.ty !== current.ty) {
      setSmooth(true);
      setView(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-follow on a new reveal only
  }, [revealSeq, follow, status]);

  const stopFollow = useCallback(() => {
    if (usePlayerStore.getState().follow) usePlayerStore.getState().setFollow(false);
  }, []);

  /* ── wheel / trackpad pans the board ─────────────────────────────── */
  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      const { w: cw, h: ch } = sizeRef.current;
      if (!cw || !ch) return;
      stopFollow();
      setSmooth(false);
      const dx = event.shiftKey ? event.deltaY : event.deltaX;
      const dy = event.shiftKey ? 0 : event.deltaY;
      setView((v) =>
        clampView({ scale: v.scale, tx: v.tx - dx, ty: v.ty - dy }, cw, ch, worldRef.current),
      );
    },
    [stopFollow],
  );

  /* ── dragging anywhere pans the board (content stays put) ────────── */
  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).closest('button')) return;
      stopFollow();
      setSmooth(false);
      dragRef.current = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [stopFollow],
  );

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const { w: cw, h: ch } = sizeRef.current;
    if (!cw || !ch) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    setView((v) =>
      clampView({ scale: v.scale, tx: v.tx + dx, ty: v.ty + dy }, cw, ch, worldRef.current),
    );
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }, []);

  /* ── keyboard: undo / redo ───────────────────────────────────────── */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const board = useBoardStore.getState();
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        board.undo();
      } else if (
        mod &&
        (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))
      ) {
        event.preventDefault();
        board.redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const empty = elements.length === 0;

  /* The pen is derived from the newest element, never stored. It starts at
     the far edge of that element and sweeps across it (right→left for text,
     left→right for shapes), so the reveal reads as live handwriting. */
  const penElement = lastRevealedId
    ? elements.find((el) => el.id === lastRevealedId)
    : undefined;
  const penBox = lastRevealedId ? resolveBBox(elements, lastRevealedId) : null;
  const penVisible = Boolean(penBox) && status === 'playing';
  const penX = penBox ? penBox.x + penBox.w : 0;
  const penY = penBox ? penBox.y + penBox.h : 0;
  const penRightToLeft = penElement?.cmd.op === 'TEXT';
  const penSweep = penBox ? Math.min(Math.max(penBox.w, 24), 420) : 0;

  return (
    <div
      ref={containerRef}
      className="wb-sheet-stage absolute inset-0 cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="wb-sheet absolute top-0 left-0 origin-top-left"
        style={{
          width: BOARD_WIDTH,
          height: worldH,
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          transition: smooth ? 'transform 620ms cubic-bezier(0.22, 0.61, 0.36, 1)' : 'none',
        }}
      >
        <WhiteboardRenderer elements={elements} worldHeight={worldH} />

        {penVisible ? (
          <div className="wb-pen" style={{ left: penX, top: penY }} aria-hidden>
            {/* keyed by reveal so the sweep replays on every stroke */}
            <div
              key={revealSeq}
              className="wb-pen-write"
              style={
                {
                  '--pen-from': penRightToLeft ? '0px' : `${-penSweep}px`,
                  '--pen-to': penRightToLeft ? `${-penSweep}px` : '0px',
                } as React.CSSProperties
              }
            >
              <div className="wb-pen-flash">
                <Pencil className="wb-pen-icon size-4" />
                <span className="wb-pen-label">{t('wb.penLabel')}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {empty ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <p
            className="wb-hand max-w-xl text-[clamp(1.5rem,3vw,2.2rem)] italic leading-relaxed text-[#3D315E]/90"
            style={{ fontFamily: "'Caveat', 'Aref Ruqaa', cursive" }}
          >
            {t('wb.empty.title')}
          </p>
          <div className="pointer-events-auto flex flex-wrap justify-center gap-2">
            {(['wb.example.1', 'wb.example.2', 'wb.example.3'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent('wb-example', { detail: t(key) }))
                }
                className="rounded-full border border-[#5B3FC7]/20 bg-white/60 px-4 py-2 text-[12px] font-medium text-[#3D315E]/85 backdrop-blur transition hover:border-[#5B3FC7]/45 hover:bg-white"
              >
                {t(key)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* board controls — quiet, frosted, out of the content's way */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-0.5 rounded-full border border-[#3D315E]/10 bg-white/75 p-1 shadow-[0_12px_30px_-18px_rgba(61,49,94,0.6)] backdrop-blur-md">
        <BoardButton
          label={t('wb.undo')}
          disabled={!canUndo}
          onClick={() => useBoardStore.getState().undo()}
        >
          <Undo2 className="size-[15px]" />
        </BoardButton>
        <BoardButton
          label={t('wb.redo')}
          disabled={!canRedo}
          onClick={() => useBoardStore.getState().redo()}
        >
          <Redo2 className="size-[15px]" />
        </BoardButton>
        <span className="mx-0.5 h-4 w-px bg-[#3D315E]/10" />
        <BoardButton label={t('wb.clearBoard')} onClick={() => useBoardStore.getState().clear()}>
          <Eraser className="size-[15px]" />
        </BoardButton>
      </div>
    </div>
  );
}

function BoardButton({
  label,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-full transition disabled:opacity-25 ${
        danger
          ? 'text-[#B23A18] hover:bg-[#FB7E5B]/15'
          : 'text-[#4A3F6B] hover:bg-[#5B3FC7]/10 hover:text-[#5B3FC7]'
      }`}
    >
      {children}
    </button>
  );
}
