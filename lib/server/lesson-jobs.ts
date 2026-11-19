/**
 * Lesson jobs — a tiny in-process queue so a slow teaching model never hits
 * the platform's 30-second request ceiling.
 *
 * The client POSTs a question, gets a job id immediately, then polls until the
 * lesson is ready. The model call keeps running on the server after the first
 * response has been flushed, which is exactly what a long-running Node dyno is
 * good at. Jobs are pruned after a few minutes; a missing job simply reads as
 * "failed" and the caller reports it honestly instead of drawing a canned
 * lesson that does not answer the student's question.
 */
import { randomUUID } from 'crypto';

export interface LessonPayload {
  success: true;
  title: string;
  beats: unknown[];
  dropped?: number;
  fallback: boolean;
}

export type LessonJobState =
  | { status: 'pending' }
  | ({ status: 'done' } & LessonPayload)
  | { status: 'failed'; code: string; message: string };

interface JobEntry {
  createdAt: number;
  state: LessonJobState;
}

const JOBS = new Map<string, JobEntry>();
const TTL_MS = 5 * 60_000;
const MAX_JOBS = 200;

function prune(now: number): void {
  for (const [id, job] of JOBS) {
    if (now - job.createdAt > TTL_MS) JOBS.delete(id);
  }
  // Hard cap so a burst of questions can never grow the map without bound.
  while (JOBS.size > MAX_JOBS) {
    const oldest = JOBS.keys().next().value;
    if (oldest === undefined) break;
    JOBS.delete(oldest);
  }
}

export function createLessonJob(): string {
  const now = Date.now();
  prune(now);
  const id = randomUUID();
  JOBS.set(id, { createdAt: now, state: { status: 'pending' } });
  return id;
}

export function finishLessonJob(id: string, state: LessonJobState): void {
  const job = JOBS.get(id);
  if (job) job.state = state;
}

export function readLessonJob(id: string): LessonJobState {
  prune(Date.now());
  return JOBS.get(id)?.state ?? { status: 'failed', code: 'JOB_NOT_FOUND', message: 'Lesson job expired' };
}
