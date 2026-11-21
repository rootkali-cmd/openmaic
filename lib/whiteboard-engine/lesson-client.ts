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
  /** A photo/screenshot the student attached (data URL, downscaled client-side). */
  image?: { dataUrl: string; name?: string };
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
  code?: string;
  message?: string;
  error?: string;
}

/** A job only disappears when the dyno restarted or the entry expired. */
class LessonRequestError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

const POLL_MS = 900;
const DEADLINE_MS = 180_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function requestLesson(input: LessonInput): Promise<LessonResult> {
  try {
    return await requestLessonOnce(input);
  } catch (error) {
    // A deploy or dyno recycle wipes the in-process job map, so a question
    // that was already sent can come back as "job not found". The question is
    // still valid, so ask once more instead of showing an apology.
    if (error instanceof LessonRequestError && error.code === 'JOB_NOT_FOUND') {
      return requestLessonOnce(input);
    }
    throw error;
  }
}

async function requestLessonOnce(input: LessonInput): Promise<LessonResult> {
  const start = await fetch('/api/whiteboard/lesson', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const started = (await start.json()) as JobStart;
  if (!start.ok || !started.jobId) {
    throw new LessonRequestError(started.error ?? `HTTP ${start.status}`);
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
    if (state.status === 'failed') {
      throw new LessonRequestError(
        state.message ?? state.error ?? 'lesson failed',
        state.code,
      );
    }
    return { title: state.title, beats: state.beats, fallback: state.fallback };
  }
  throw new LessonRequestError('lesson timed out', 'TIMEOUT');
}
