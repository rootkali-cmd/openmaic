/**
 * Board state — a pure reducer over validated DrawCommands.
 *
 * The renderer never mutates anything itself: every change to the board goes
 * through `apply`, which also keeps a cursor-based undo/redo stack. Reveal
 * (progressive rendering) is deliberately kept out of the history so that
 * replaying a lesson never floods the undo stack.
 */
import { create } from 'zustand';
import {
  commandBBox,
  parseDrawCommand,
  type BBox,
  type DrawCommand,
} from './dsl';

export interface BoardElement {
  /** Stable identity — either authored by the AI or minted by the store. */
  id: string;
  cmd: DrawCommand;
  /** Elements stay invisible until their turn in the progressive reveal. */
  revealed: boolean;
  /** Set by GROUP so a whole cluster can be moved together. */
  groupId?: string;
}

const HISTORY_LIMIT = 60;

interface BoardState {
  elements: BoardElement[];
  past: BoardElement[][];
  future: BoardElement[][];
  selectedId: string | null;

  /** Apply one validated command (undoable by default). */
  apply: (cmd: DrawCommand, opts?: { silent?: boolean }) => void;
  /** Push one history checkpoint (used to make a whole beat one undo step). */
  pushHistory: () => void;
  /** Progressive reveal of an element (not undoable). */
  reveal: (elementId: string) => void;
  revealAll: () => void;
  select: (elementId: string | null) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  /** Snapshot before a user gesture (drag) so the whole drag is one undo step. */
  beginGesture: () => void;
  /** Preview-move during a drag without touching history. */
  previewMove: (elementId: string, dx: number, dy: number) => void;
  clear: () => void;
  /** Replace everything (new lesson, board preserved=false). */
  reset: (elements?: BoardElement[]) => void;
}

let mintCounter = 0;
function mintId(prefix = 'el'): string {
  mintCounter += 1;
  return `${prefix}${Date.now().toString(36)}${mintCounter.toString(36)}`;
}

function translateCmd(cmd: DrawCommand, dx: number, dy: number): DrawCommand {
  switch (cmd.op) {
    case 'TEXT':
    case 'MATH':
    case 'TABLE':
    case 'FLOWCHART':
      return { ...cmd, x: cmd.x + dx, y: cmd.y + dy } as DrawCommand;
    case 'RECTANGLE':
      return { ...cmd, x: cmd.x + dx, y: cmd.y + dy };
    case 'LINE':
    case 'ARROW':
      return { ...cmd, x1: cmd.x1 + dx, y1: cmd.y1 + dy, x2: cmd.x2 + dx, y2: cmd.y2 + dy };
    case 'CIRCLE':
      return { ...cmd, cx: cmd.cx + dx, cy: cmd.cy + dy };
    case 'HIGHLIGHT':
      if (cmd.region) {
        return { ...cmd, region: { ...cmd.region, x: cmd.region.x + dx, y: cmd.region.y + dy } };
      }
      return cmd;
    default:
      return cmd;
  }
}

export function elementBBox(el: BoardElement): BBox | null {
  if (el.cmd.op === 'HIGHLIGHT' && !el.cmd.region && el.cmd.target) return null;
  return commandBBox(el.cmd);
}

function moveElements(
  elements: BoardElement[],
  ids: string[],
  dx: number,
  dy: number,
): BoardElement[] {
  const idSet = new Set(ids);
  const groupSet = new Set(
    elements.filter((e) => e.groupId && idSet.has(e.id)).map((e) => e.groupId),
  );
  return elements.map((el) => {
    const inScope = idSet.has(el.id) || (el.groupId !== undefined && groupSet.has(el.groupId));
    return inScope ? { ...el, cmd: translateCmd(el.cmd, dx, dy) } : el;
  });
}

export const useBoardStore = create<BoardState>((set, get) => {
  const snapshot = () => {
    const { elements, past } = get();
    const nextPast = [...past, elements];
    if (nextPast.length > HISTORY_LIMIT) nextPast.shift();
    return nextPast;
  };

  return {
    elements: [],
    past: [],
    future: [],
    selectedId: null,

    apply: (cmd, opts) =>
      set((state) => {
        // Structural commands reshape the list.
        if (cmd.op === 'ERASE') {
          let next = state.elements;
          if (cmd.target === 'all') next = [];
          else if (cmd.target === 'last') next = state.elements.slice(0, -1);
          else next = state.elements.filter((el) => el.id !== cmd.target);
          if (next.length === state.elements.length) return state; // no-op
          return {
            elements: next,
            past: opts?.silent ? state.past : snapshot(),
            future: opts?.silent ? state.future : [],
            selectedId:
              state.selectedId && !next.some((el) => el.id === state.selectedId)
                ? null
                : state.selectedId,
          };
        }

        if (cmd.op === 'GROUP') {
          const idSet = new Set(cmd.ids);
          const groupId = mintId('grp');
          let hit = 0;
          let next = state.elements.map((el) => {
            if (!idSet.has(el.id)) return el;
            hit += 1;
            return { ...el, groupId };
          });
          if (cmd.dx !== 0 || cmd.dy !== 0) next = moveElements(next, cmd.ids, cmd.dx, cmd.dy);
          if (hit === 0) return state;
          return {
            elements: next,
            past: opts?.silent ? state.past : snapshot(),
            future: opts?.silent ? state.future : [],
          };
        }

        if (cmd.op === 'MOVE') {
          const exists = state.elements.some((el) => el.id === cmd.target);
          if (!exists) return state;
          const next = moveElements(state.elements, [cmd.target], cmd.dx, cmd.dy);
          return {
            elements: next,
            past: opts?.silent ? state.past : snapshot(),
            future: opts?.silent ? state.future : [],
          };
        }

        // Everything else upserts by id (an AI may re-send an id to revise).
        const elementId = cmd.id ?? mintId();
        const index = state.elements.findIndex((el) => el.id === elementId);
        const revealed = index >= 0 ? state.elements[index].revealed : false;
        const element: BoardElement = { id: elementId, cmd, revealed };
        const next =
          index >= 0
            ? state.elements.map((el, i) => (i === index ? element : el))
            : [...state.elements, element];
        return {
          elements: next,
          past: opts?.silent ? state.past : snapshot(),
          future: opts?.silent ? state.future : [],
        };
      }),

    reveal: (elementId) =>
      set((state) => ({
        elements: state.elements.map((el) =>
          el.id === elementId && !el.revealed ? { ...el, revealed: true } : el,
        ),
      })),

    revealAll: () =>
      set((state) => ({
        elements: state.elements.map((el) => (el.revealed ? el : { ...el, revealed: true })),
      })),

    select: (elementId) => set({ selectedId: elementId }),

    undo: () =>
      set((state) => {
        if (state.past.length === 0) return state;
        const previous = state.past[state.past.length - 1];
        return {
          elements: previous,
          past: state.past.slice(0, -1),
          future: [state.elements, ...state.future].slice(0, HISTORY_LIMIT),
          selectedId:
            state.selectedId && previous.some((el) => el.id === state.selectedId)
              ? state.selectedId
              : null,
        };
      }),

    redo: () =>
      set((state) => {
        if (state.future.length === 0) return state;
        const [next, ...rest] = state.future;
        return {
          elements: next,
          past: [...state.past, state.elements].slice(-HISTORY_LIMIT),
          future: rest,
          selectedId:
            state.selectedId && next.some((el) => el.id === state.selectedId)
              ? state.selectedId
              : null,
        };
      }),

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    pushHistory: () => set(() => ({ past: snapshot(), future: [] })),

    beginGesture: () => set(() => ({ past: snapshot(), future: [] })),

    previewMove: (elementId, dx, dy) =>
      set((state) => ({ elements: moveElements(state.elements, [elementId], dx, dy) })),

    clear: () =>
      set((state) =>
        state.elements.length === 0
          ? state
          : { elements: [], past: snapshot(), future: [], selectedId: null },
      ),

    reset: (elements = []) =>
      set((state) => ({
        elements,
        past: elements.length > 0 ? snapshot() : state.past,
        future: [],
        selectedId: null,
      })),
  };
});

/** Convenience selector: bounding box of an element, resolving
 *  target-based highlights against the element they point at. */
export function resolveBBox(
  elements: BoardElement[],
  elementId: string,
): BBox | null {
  const el = elements.find((e) => e.id === elementId);
  if (!el) return null;
  if (el.cmd.op === 'HIGHLIGHT' && !el.cmd.region && el.cmd.target) {
    return resolveBBox(elements, el.cmd.target);
  }
  return elementBBox(el);
}

/** Parse-and-apply helper for call sites holding untrusted JSON. */
export function applyRawCommand(input: unknown): boolean {
  const cmd = parseDrawCommand(input);
  if (!cmd) return false;
  useBoardStore.getState().apply(cmd);
  return true;
}