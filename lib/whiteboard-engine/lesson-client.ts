/**
 * Client for the lesson API.
 *
 * The route answers with a job id immediately and generates the lesson in the
 * background, so a slow teaching model never trips the platform's 30-second
 * request ceiling. This helper hides the polling behind one await, and both
 * the tutor chat and the whiteboard use it.
 */
import type { LessonBeat } from './lesson';

export interface LessonInput {
  question: string;
  existingBounds?: { x: number; y: number; w: number; h: number } | null;
  history?: { question: string; title: string }[];
  locale?: string;
}

export interface LessonResult {
  title?: string;
  beats?: LessonBeat[];
  fallback?: boolean;
}

interface JobStart {
  success?: boolean;
  jobId?: string;
  error?: string;
}

interface JobState extends LessonResult {
  status?: 'pending' | 'done' | 'failed';
  error?: string;
}

const POLL_MS = 900;
const DEADLINE_MS = 100_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function requestLesson(input: LessonInput): Promise<LessonResult> {
  const start = await fetch('/api/whiteboard/lesson', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const started = (await start.json()) as JobStart;
  if (!start.ok || !started.jobId) {
    throw new Error(started.error ?? `HTTP ${start.status}`);
  }

  const deadline = Date.now() + DEADLINE_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const response = await fetch(`/api/whiteboard/lesson?job=${started.jobId}`, {
      cache: 'no-store',
    });
    if (!response.ok) continue;
    const state = (await response.json()) as JobState;
    if (!state.status || state.status === 'pending') continue;
    if (state.status === 'failed') throw new Error(state.error ?? 'lesson failed');
    return { title: state.title, beats: state.beats, fallback: state.fallback };
  }
  throw new Error('lesson timed out');
}
