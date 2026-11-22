/**
 * Local study data — the source of truth the in-app sections read from.
 *
 * Lessons, quiz attempts, focus sessions and study plans are kept in this
 * browser only. Nothing here invents cross-user numbers: the leaderboard is a
 * personal progress view until accounts and a shared store exist.
 */
export interface LessonRecord {
  id: string;
  question: string;
  title: string;
  summary?: string;
  at: number;
  /**
   * The lesson as it was taught, so opening it from the library replays the
   * same board instead of paying for a fresh generation. Older records (or
   * records trimmed to save space) have no body and are re-asked on open.
   */
  body?: { title: string; beats: { speech: string; draws: unknown[] }[] };
}

export interface QuizAttempt {
  id: string;
  topic: string;
  total: number;
  correct: number;
  at: number;
}

export interface FocusSession {
  id: string;
  minutes: number;
  completed: boolean;
  at: number;
}

export interface PlanTask {
  id: string;
  label: string;
  done: boolean;
}

export interface StudyPlan {
  id: string;
  subject: string;
  examDate: string;
  topics: string[];
  minutesPerDay: number;
  createdAt: number;
  tasks: PlanTask[];
}

const LESSONS_KEY = 'darsak-lesson-history';
const QUIZZES_KEY = 'darsak-quiz-attempts';
const FOCUS_KEY = 'darsak-focus-sessions';
const PLANS_KEY = 'darsak-study-plans';

/** Fired on window whenever one of the stores changes in this tab. */
export const STUDY_DATA_EVENT = 'darsak-study-data';

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(STUDY_DATA_EVENT, { detail: key }));
  } catch {
    /* storage unavailable — the current page still holds its state */
  }
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ------------------------------- lessons ------------------------------- */

export function getLessons(): LessonRecord[] {
  return read<LessonRecord[]>(LESSONS_KEY, []).sort((a, b) => b.at - a.at);
}

export function addLesson(input: {
  question: string;
  title: string;
  summary?: string;
  body?: LessonRecord['body'];
}): void {
  const question = input.question.trim();
  if (!question) return;
  const next: LessonRecord = {
    id: newId('lesson'),
    question,
    title: input.title.trim() || question,
    summary: input.summary?.trim() || undefined,
    at: Date.now(),
    body: input.body,
  };
  const kept = getLessons().filter(
    (item) => item.question !== question || item.title !== next.title,
  );
  // Full boards are the big part of this store: keep the newest 60, and the
  // older ones stay as title-only history (they can be taught again).
  const nextStore = [next, ...kept].slice(0, 200);
  nextStore.forEach((record, index) => {
    if (index >= 60) delete record.body;
  });
  write(LESSONS_KEY, nextStore);
}

/** One stored lesson by id, with its board when it still has one. */
export function getLesson(id: string): LessonRecord | undefined {
  return getLessons().find((item) => item.id === id);
}

/* -------------------------------- quizzes ------------------------------- */

export function getQuizAttempts(): QuizAttempt[] {
  return read<QuizAttempt[]>(QUIZZES_KEY, []).sort((a, b) => b.at - a.at);
}

export function addQuizAttempt(input: { topic: string; total: number; correct: number }): void {
  const attempt: QuizAttempt = {
    id: newId('quiz'),
    topic: input.topic.trim() || 'اختبار',
    total: input.total,
    correct: input.correct,
    at: Date.now(),
  };
  write(QUIZZES_KEY, [attempt, ...getQuizAttempts()].slice(0, 100));
}

/* --------------------------------- focus -------------------------------- */

export function getFocusSessions(): FocusSession[] {
  return read<FocusSession[]>(FOCUS_KEY, []).sort((a, b) => b.at - a.at);
}

export function addFocusSession(input: { minutes: number; completed: boolean }): void {
  const session: FocusSession = {
    id: newId('focus'),
    minutes: Math.max(1, Math.round(input.minutes)),
    completed: input.completed,
    at: Date.now(),
  };
  write(FOCUS_KEY, [session, ...getFocusSessions()].slice(0, 300));
}

/* --------------------------------- plans -------------------------------- */

export function getPlans(): StudyPlan[] {
  return read<StudyPlan[]>(PLANS_KEY, []).sort((a, b) => b.createdAt - a.createdAt);
}

export function savePlan(plan: StudyPlan): void {
  const plans = getPlans();
  const index = plans.findIndex((item) => item.id === plan.id);
  if (index >= 0) plans[index] = plan;
  else plans.unshift(plan);
  write(PLANS_KEY, plans.slice(0, 60));
}

export function deletePlan(id: string): void {
  write(
    PLANS_KEY,
    getPlans().filter((plan) => plan.id !== id),
  );
}

export function togglePlanTask(planId: string, taskId: string): void {
  const plan = getPlans().find((item) => item.id === planId);
  if (!plan) return;
  savePlan({
    ...plan,
    tasks: plan.tasks.map((task) =>
      task.id === taskId ? { ...task, done: !task.done } : task,
    ),
  });
}

/* -------------------------------- derived ------------------------------- */

export interface DayBucket {
  key: string;
  label: string;
  lessons: number;
  quizzes: number;
  focusMinutes: number;
  total: number;
}

/** Activity for the last `days` days, oldest first, from real local records. */
export function activityByDay(days = 7): DayBucket[] {
  const lessons = getLessons();
  const quizzes = getQuizAttempts();
  const focus = getFocusSessions();
  const formatter = new Intl.DateTimeFormat('ar-EG', { weekday: 'short' });
  const buckets: DayBucket[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const start = date.getTime();
    const end = start + 86_400_000;
    const inDay = (at: number) => at >= start && at < end;
    const lessonCount = lessons.filter((item) => inDay(item.at)).length;
    const quizCount = quizzes.filter((item) => inDay(item.at)).length;
    const minutes = focus
      .filter((item) => inDay(item.at))
      .reduce((sum, item) => sum + item.minutes, 0);
    buckets.push({
      key: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
      label: formatter.format(date),
      lessons: lessonCount,
      quizzes: quizCount,
      focusMinutes: minutes,
      total: lessonCount + quizCount + (minutes > 0 ? 1 : 0),
    });
  }
  return buckets;
}

/** Consecutive days (ending today or yesterday) with any recorded activity. */
export function currentStreak(): number {
  const days = new Set(activityByDay(60).filter((day) => day.total > 0).map((day) => day.key));
  let streak = 0;
  for (let offset = 0; offset < 60; offset += 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    if (days.has(key)) streak += 1;
    else if (offset === 0) continue;
    else break;
  }
  return streak;
}

export function totalFocusMinutes(): number {
  return getFocusSessions().reduce((sum, item) => sum + item.minutes, 0);
}

export function formatRelative(at: number): string {
  const diff = Date.now() - at;
  const minute = 60_000;
  const hour = 60 * minute;
  if (diff < minute) return 'دلوقتي';
  if (diff < hour) return `من ${Math.floor(diff / minute)} دقيقة`;
  if (diff < 24 * hour) return `من ${Math.floor(diff / hour)} ساعة`;
  const days = Math.floor(diff / (24 * hour));
  if (days === 1) return 'امبارح';
  if (days < 30) return `من ${days} يوم`;
  return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' }).format(at);
}

export function daysUntil(dateString: string): number | null {
  if (!dateString) return null;
  const target = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
