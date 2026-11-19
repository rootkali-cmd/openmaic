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
 * The global app shell (sidebar + top bar) frames the board; questions can
 * also arrive from the tutor home via ?q=.
 */
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { AppShell } from '@/components/shell/app-shell';
import { BoardView } from '@/components/whiteboard-engine/board-view';
import { InputBar } from '@/components/whiteboard-engine/input-bar';
import { LessonStatus } from '@/components/whiteboard-engine/lesson-status';
import { TeacherHud } from '@/components/whiteboard-engine/teacher-hud';
import { useI18n } from '@/lib/hooks/use-i18n';
import { resolveBBox, useBoardStore } from '@/lib/whiteboard-engine/board-store';
import type { Lesson } from '@/lib/whiteboard-engine/lesson';
import { requestLesson } from '@/lib/whiteboard-engine/lesson-client';
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

function WhiteboardSurface() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const historyRef = useRef<{ question: string; title: string }[]>([]);

  const ask = useCallback(async (question: string) => {
    if (!question.trim() || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);

    const player = usePlayerStore.getState();
    const previousStatus = player.status;
    const wasActive = previousStatus === 'playing' || previousStatus === 'paused';

    // Interruption contract: an active lesson PAUSES (board preserved); an
    // idle board goes through the loading state instead.
    if (wasActive) player.pause();
    else player.setLoading();

    const deliver = (lesson: Lesson) => {
      const current = usePlayerStore.getState();
      if (wasActive) current.answer(lesson);
      // A new question starts a clean board; an interrupted lesson is
      // spliced in by answer() and keeps what is already drawn.
      else current.start(lesson, { clear: true });
      historyRef.current = [
        ...historyRef.current,
        { question, title: lesson.title },
      ].slice(-6);
    };

    try {
      const data = await requestLesson({
        question,
        // A fresh board starts at the top; only an interrupted lesson keeps
        // its content, so only then does the model need the occupied bounds.
        existingBounds: wasActive ? computeBoardBounds() : null,
        history: historyRef.current.slice(-3),
      });
      if (!Array.isArray(data.beats) || data.beats.length === 0) {
        throw new Error('malformed lesson payload');
      }
      deliver({ title: data.title?.trim() || question, beats: data.beats });
    } catch (error) {
      // No canned substitute: an unrelated lesson is worse than an honest
      // failure. Put the board back the way the student left it.
      console.error('whiteboard lesson request failed', error);
      const current = usePlayerStore.getState();
      if (wasActive) current.resume();
      else usePlayerStore.setState({ status: previousStatus === 'done' ? 'done' : 'idle' });
      toast.error('معلش، مقدرتش أجهّز الشرح دلوقتي — جرّب تسأل تاني.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  // Questions handed over from the tutor home arrive as ?q=.
  const handedQuestion = searchParams.get('q');
  useEffect(() => {
    if (!handedQuestion) return;
    ask(handedQuestion.trim());
    // Consume it once: replace the URL so a refresh doesn't re-ask.
    window.history.replaceState(null, '', '/whiteboard');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per handed question
  }, [handedQuestion]);

  return (
    <AppShell
      title={t('wb.title')}
      actions={<LessonStatus />}
      contentClassName="overflow-hidden"
    >
      <BoardView />
      <TeacherHud />
      <InputBar onAsk={ask} busy={busy} />
    </AppShell>
  );
}

export default function WhiteboardPage() {
  // useSearchParams needs a Suspense boundary for prerendered routes.
  return (
    <Suspense fallback={<div className="h-screen w-full bg-[#0B0D16]" />}>
      <WhiteboardSurface />
    </Suspense>
  );
}
