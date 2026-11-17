'use client';

/**
 * Board view — the camera around the SVG renderer.
 *
 * Owns zoom, pan, follow-the-chalk camera, element dragging (MOVE), selection
 * and the keyboard gestures (undo/redo/delete). Everything that changes board
 * content goes through the board store; this file only manipulates the view
 * matrix and forwards user intent.
 */
import { Eraser, Maximize2, Redo2, Trash2, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { WhiteboardRenderer } from '@/components/whiteboard-engine/renderer';
import { useBoardStore, resolveBBox, type BoardElement } from '@/lib/whiteboard-engine/board-store';
import { BOARD_HEIGHT, BOARD_WIDTH } from '@/lib/whiteboard-engine/dsl';
import { useI18n } from '@/lib/hooks/use-i18n';
import { usePlayerStore } from '@/lib/whiteboard-engine/player';

interface View {
  scale: number;
  tx: number;
  ty: number;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function BoardView() {
  const { t } = useI18n();
  const elements = useBoardStore((s) => s.elements);
  const selectedId = useBoardStore((s) => s.selectedId);
  const follow = usePlayerStore((s) => s.follow);
  const revealSeq = usePlayerStore((s) => s.revealSeq);
  const lastRevealedId = usePlayerStore((s) => s.lastRevealedId);
  const status = usePlayerStore((s) => s.status);

  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const [smooth, setSmooth] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  const dragRef = useRef<{
    pointerId: number;
    mode: 'pan' | 'element';
    elementId?: string;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);

  /* ── fit the sheet to the viewport on mount ─────────────────────── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const fit = () => {
      const { clientWidth: cw, clientHeight: ch } = container;
      if (cw === 0 || ch === 0) return;
      const scale = Math.min(cw / BOARD_WIDTH, ch / BOARD_HEIGHT) * 0.94;
      setView({
        scale,
        tx: (cw - BOARD_WIDTH * scale) / 2,
        ty: (ch - BOARD_HEIGHT * scale) / 2,
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const zoomAt = useCallback((factor: number, mx: number, my: number) => {
    setSmooth(false);
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const ratio = scale / v.scale;
      return { scale, tx: mx - (mx - v.tx) * ratio, ty: my - (my - v.ty) * ratio };
    });
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      const container = containerRef.current;
      if (!container) return;
      zoomAt(factor, container.clientWidth / 2, container.clientHeight / 2);
    },
    [zoomAt],
  );

  const fitView = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    setSmooth(false);
    const { clientWidth: cw, clientHeight: ch } = container;
    const scale = Math.min(cw / BOARD_WIDTH, ch / BOARD_HEIGHT) * 0.94;
    setView({ scale, tx: (cw - BOARD_WIDTH * scale) / 2, ty: (ch - BOARD_HEIGHT * scale) / 2 });
  }, []);

  /* ── follow the teacher's latest stroke ──────────────────────────── */
  useEffect(() => {
    if (!follow || !lastRevealedId || status === 'idle') return;
    const container = containerRef.current;
    if (!container) return;
    const bbox = resolveBBox(elements, lastRevealedId);
    if (!bbox) return;
    const { clientWidth: cw, clientHeight: ch } = container;
    const { scale } = viewRef.current;
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    // Only pull the camera when the stroke is drifting out of a comfortable band.
    const current = viewRef.current;
    const screenX = current.tx + cx * scale;
    const screenY = current.ty + cy * scale;
    const marginX = cw * 0.28;
    const marginY = ch * 0.26;
    const outside =
      screenX < marginX ||
      screenX > cw - marginX ||
      screenY < marginY ||
      screenY > ch - marginY;
    if (!outside) return;
    setSmooth(true);
    setView({ scale, tx: cw / 2 - cx * scale, ty: ch / 2 - cy * scale });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-follow on a new reveal
  }, [revealSeq, follow, status]);

  /* ── wheel zoom ──────────────────────────────────────────────────── */
  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const unit = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? 400 : 1;
      const factor = Math.exp(-event.deltaY * unit * 0.0016);
      zoomAt(factor, event.clientX - rect.left, event.clientY - rect.top);
    },
    [zoomAt],
  );

  /* ── pointer: pan on background, drag on elements ─────────────────── */
  const toBoard = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - v.tx) / v.scale, y: (clientY - rect.top - v.ty) / v.scale };
  };

  const onBackgroundPointerDown = useCallback((event: React.PointerEvent) => {
    setSmooth(false);
    useBoardStore.getState().select(null);
    dragRef.current = {
      pointerId: event.pointerId,
      mode: 'pan',
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onElementPointerDown = useCallback((event: React.PointerEvent, elementId: string) => {
    event.stopPropagation();
    setSmooth(false);
    useBoardStore.getState().select(elementId);
    const point = toBoard(event.clientX, event.clientY);
    dragRef.current = {
      pointerId: event.pointerId,
      mode: 'element',
      elementId,
      startX: point.x,
      startY: point.y,
      lastX: point.x,
      lastY: point.y,
      moved: false,
    };
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.mode === 'pan') {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      drag.moved = true;
      setView((v) => ({ ...v, tx: v.tx + (event.clientX - drag.lastX), ty: v.ty + (event.clientY - drag.lastY) }));
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      return;
    }

    const point = toBoard(event.clientX, event.clientY);
    const dx = point.x - drag.lastX;
    const dy = point.y - drag.lastY;
    if (!drag.moved && Math.hypot(point.x - drag.startX, point.y - drag.startY) < 2.5) return;
    if (!drag.moved) {
      drag.moved = true;
      useBoardStore.getState().beginGesture(); // the whole drag = one undo step
    }
    if (drag.elementId && (dx !== 0 || dy !== 0)) {
      useBoardStore.getState().previewMove(drag.elementId, dx, dy);
    }
    drag.lastX = point.x;
    drag.lastY = point.y;
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId) dragRef.current = null;
  }, []);

  /* ── keyboard ────────────────────────────────────────────────────── */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const board = useBoardStore.getState();
      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        board.undo();
      } else if (mod && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
        event.preventDefault();
        board.redo();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && board.selectedId) {
        event.preventDefault();
        board.apply({ op: 'ERASE', target: board.selectedId });
        board.select(null);
      } else if (event.key === 'Escape') {
        board.select(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const empty = elements.length === 0;
  const canUndo = useBoardStore((s) => s.past.length > 0);
  const canRedo = useBoardStore((s) => s.future.length > 0);

  return (
    <div
      ref={containerRef}
      className="wb-sheet-stage relative h-full w-full overflow-hidden"
      onWheel={onWheel}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="wb-sheet absolute top-0 left-0 origin-top-left"
        style={{
          width: BOARD_WIDTH,
          height: BOARD_HEIGHT,
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          transition: smooth ? 'transform 700ms cubic-bezier(0.215, 0.61, 0.355, 1)' : 'none',
        }}
      >
        <WhiteboardRenderer
          elements={elements}
          selectedId={selectedId}
          onElementPointerDown={onElementPointerDown}
        />
      </div>

      {empty ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <p className="wb-hand text-[clamp(1.6rem,3.4vw,2.6rem)] leading-relaxed text-[#3D315E]">
            {t('wb.empty.title')}
          </p>
          <p className="max-w-md text-[13px] leading-7 text-[#6C62A0]">
            {t('wb.empty.hint')}
          </p>
          <div className="pointer-events-auto flex flex-wrap justify-center gap-2">
            {(['wb.example.1', 'wb.example.2', 'wb.example.3'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent('wb-example', { detail: t(key) }))
                }
                className="rounded-full border border-[#5B3FC7]/25 bg-white/70 px-4 py-2 text-[12px] font-medium text-[#3D315E] backdrop-blur transition hover:border-[#5B3FC7]/50 hover:bg-white"
              >
                {t(key)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* board controls */}
      <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-full border border-[#3D315E]/12 bg-white/85 p-1 shadow-[0_10px_30px_-16px_rgba(61,49,94,0.5)] backdrop-blur">
        <BoardButton
          label={t('wb.undo')}
          disabled={!canUndo}
          onClick={() => useBoardStore.getState().undo()}
        >
          <Undo2 className="size-4" />
        </BoardButton>
        <BoardButton
          label={t('wb.redo')}
          disabled={!canRedo}
          onClick={() => useBoardStore.getState().redo()}
        >
          <Redo2 className="size-4" />
        </BoardButton>
        <span className="mx-0.5 h-5 w-px bg-[#3D315E]/12" />
        <BoardButton label={t('wb.zoomOut')} onClick={() => zoomBy(1 / 1.25)}>
          <ZoomOut className="size-4" />
        </BoardButton>
        <BoardButton label={t('wb.zoomIn')} onClick={() => zoomBy(1.25)}>
          <ZoomIn className="size-4" />
        </BoardButton>
        <BoardButton label={t('wb.fit')} onClick={fitView}>
          <Maximize2 className="size-4" />
        </BoardButton>
        <span className="mx-0.5 h-5 w-px bg-[#3D315E]/12" />
        <BoardButton label={t('wb.clearBoard')} onClick={() => useBoardStore.getState().clear()}>
          <Eraser className="size-4" />
        </BoardButton>
        {selectedId ? (
          <BoardButton
            label={t('wb.deleteElement')}
            danger
            onClick={() => {
              const board = useBoardStore.getState();
              board.apply({ op: 'ERASE', target: board.selectedId as string });
              board.select(null);
            }}
          >
            <Trash2 className="size-4" />
          </BoardButton>
        ) : null}
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
      className={`grid size-9 place-items-center rounded-full transition disabled:opacity-30 ${
        danger
          ? 'text-[#B23A18] hover:bg-[#FB7E5B]/15'
          : 'text-[#3D315E] hover:bg-[#5B3FC7]/10 hover:text-[#5B3FC7]'
      }`}
    >
      {children}
    </button>
  );
}

/** Exported for the toolbar in the top bar. */
export type { BoardElement };