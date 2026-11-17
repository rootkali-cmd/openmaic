'use client';

/**
 * AI Whiteboard Engine — page shell.
 *
 * Assembles the five separated concerns of the engine:
 *   1. Teaching AI          → POST /api/whiteboard/lesson
 *   2. Drawing instructions → validated DrawCommands (lib/whiteboard-engine/dsl)
 *   3. Rendering            → WhiteboardRenderer + BoardView
 *   4. Speech               → lib/whiteboard-engine/speech (player-synced)
 *   5. Session state        → board store + lesson player (undo/redo, queue)
 *
 * This file owns only the conversation loop: question → lesson → play.
 */
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { BoardView } from '@/components/whiteboard-engine/board-view';
import { InputBar } from '@/components/whiteboard-engine/input-bar';
import { Sidebar } from '@/components/whiteboard-engine/sidebar';
import { TeacherHud } from '@/components/whiteboard-engine/teacher-hud';
import { Topbar } from '@/components/whiteboard-engine/topbar';
import { resolveBBox, useBoardStore } from '@/lib/whiteboard-engine/board-store';
import { FALLBACK_LESSON, type Lesson } from '@/lib/whiteboard-engine/lesson';
import { usePlayerStore } from '@/lib/whiteboard-engine/player';

interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Union of everything currently on the board — keeps the model from
 *  drawing on top of a previous lesson. */
function computeBoardBounds(): Bounds | null {
  const { elements } = useBoardStore.getState();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const box = resolveBBox(elements, el.id);
    if (!box) continue;
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  }
  if (maxX === -Infinity) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export default function WhiteboardPage() {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const historyRef = useRef<{ question: string; title: string }[]>([]);

  const ask = useCallback(async (question: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);

    const player = usePlayerStore.getState();
    const wasActive = player.status === 'playing' || player.status === 'paused';

    // Interruption contract: an active lesson PAUSES (board preserved); an
    // idle board goes through the loading state instead.
    if (wasActive) player.pause();
    else player.setLoading();

    const deliver = (lesson: Lesson) => {
      const current = usePlayerStore.getState();
      if (wasActive) current.answer(lesson);
      else current.start(lesson, { clear: false });
      historyRef.current = [
        ...historyRef.current,
        { question, title: lesson.title },
      ].slice(-6);
    };

    try {
      const response = await fetch('/api/whiteboard/lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          existingBounds: computeBoardBounds(),
          history: historyRef.current.slice(-3),
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as {
        success?: boolean;
        title?: string;
        beats?: Lesson['beats'];
        fallback?: boolean;
      };
      if (!data.success || !Array.isArray(data.beats) || data.beats.length === 0) {
        throw new Error('malformed lesson payload');
      }
      deliver({ title: data.title?.trim() || question, beats: data.beats });
      if (data.fallback) {
        toast.info('المدرس رجّع درس جاهز — جرّب سؤالك تاني بعد شوية');
      }
    } catch (error) {
      // Never dead-end: serve the bundled lesson so the board keeps teaching.
      console.error('whiteboard lesson request failed', error);
      deliver(FALLBACK_LESSON);
      toast.error('تعذّر الوصول للمدرس الآن — عرضنا درس جاهز لحد ما يرجع');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#0B0D16]">
      <Sidebar />
      <div className="flex h-screen flex-col pl-[236px]">
        <Topbar />
        <main className="relative min-h-0 flex-1">
          <BoardView />
          <TeacherHud />
          <InputBar onAsk={ask} busy={busy} />
        </main>
      </div>
    </div>
  );
}