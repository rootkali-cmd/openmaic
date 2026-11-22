'use client';

/**
 * Cards for the library-style search page.
 *
 * Each result reads as a real card: a board preview on top (the lesson's own
 * first lines, plans get a progress cover, quizzes a score cover) and the
 * title/description below. A lesson with a stored board links to the replay
 * (`?lesson=<id>`), so opening it never pays for a second generation.
 */
import { ArrowLeft, BookOpen, FlaskConical, Target } from 'lucide-react';
import Link from 'next/link';

import type { LessonRecord, QuizAttempt, StudyPlan } from '@/lib/study-data';

interface CoverLine {
  text: string;
  kind: 'title' | 'text' | 'code';
  color: string;
}

function lessonLines(record: LessonRecord): CoverLine[] {
  const beats = record.body?.beats ?? [];
  const lines: CoverLine[] = [];
  for (const beat of beats) {
    for (const draw of beat.draws) {
      if (!draw || typeof draw !== 'object') continue;
      const command = draw as { op?: string; text?: string; color?: string; size?: number };
      if (command.op !== 'TEXT' && command.op !== 'CODE') continue;
      const text = typeof command.text === 'string' ? command.text.trim() : '';
      if (!text) continue;
      lines.push({
        text,
        kind: command.op === 'CODE' ? 'code' : (command.size ?? 24) >= 34 ? 'title' : 'text',
        color: command.color ?? '#3D315E',
      });
      if (lines.length >= 5) return lines;
    }
  }
  return lines;
}

/** A small, honest preview of the board (not a live renderer). */
function LessonCover({ record }: { record: LessonRecord }) {
  const lines = lessonLines(record);
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#EEe9FA]">
      <div
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(91,63,199,0.22) 1px, transparent 1.2px)',
          backgroundSize: '14px 14px',
        }}
      />
      <div aria-hidden className="absolute inset-y-0 start-0 w-1 bg-[#5B3FC7]/70" />
      <div className="relative flex h-full flex-col gap-1.5 px-4 py-3 text-start">
        {lines.length > 0 ? (
          lines.map((line, index) =>
            line.kind === 'code' ? (
              <span
                key={`${index}-${line.text.slice(0, 8)}`}
                dir="ltr"
                className="max-w-full truncate rounded bg-white/85 px-1.5 py-0.5 text-start font-mono text-[10px] text-[#241B45]"
              >
                {line.text}
              </span>
            ) : (
              <span
                key={`${index}-${line.text.slice(0, 8)}`}
                className={`truncate ${
                  line.kind === 'title'
                    ? 'text-[15px] font-black leading-6'
                    : 'text-[10.5px] leading-4'
                }`}
                style={{ color: line.color }}
              >
                {line.text}
              </span>
            ),
          )
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-2 text-[#3D315E]/45">
            <BookOpen className="size-7" aria-hidden />
            <span className="text-[10.5px]">لسه مفيش نسخة محفوظة من السبورة</span>
          </span>
        )}
      </div>
    </div>
  );
}

function PlanCover({ plan }: { plan: StudyPlan }) {
  const done = plan.tasks.filter((task) => task.done).length;
  const percent = plan.tasks.length > 0 ? Math.round((done / plan.tasks.length) * 100) : 0;
  return (
    <div className="relative flex h-full w-full items-center justify-between overflow-hidden bg-gradient-to-br from-[#5B3FC7] via-[#6E54D6] to-[#9178E6] px-4">
      <div className="min-w-0">
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold text-white">
          خطة مذاكرة
        </span>
        <p className="mt-2 truncate text-[14px] font-black text-white">{plan.subject}</p>
        <p className="mt-0.5 text-[10px] text-white/70">
          {done}/{plan.tasks.length} مهمة
        </p>
      </div>
      <div className="relative grid size-14 shrink-0 place-items-center">
        <svg viewBox="0 0 36 36" className="size-14 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="4" />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="#FFD84D"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${(percent / 100) * 94.2} 94.2`}
          />
        </svg>
        <span className="absolute text-[10px] font-black text-white">{percent}%</span>
      </div>
    </div>
  );
}

function QuizCover({ attempt }: { attempt: QuizAttempt }) {
  const percent = attempt.total > 0 ? Math.round((attempt.correct / attempt.total) * 100) : 0;
  return (
    <div className="relative flex h-full w-full items-center justify-between overflow-hidden bg-gradient-to-br from-[#0E8A62] via-[#00A876] to-[#2FCB9A] px-4">
      <div className="min-w-0">
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold text-white">
          اختبار
        </span>
        <p className="mt-2 truncate text-[13.5px] font-black text-white">{attempt.topic}</p>
        <p className="mt-0.5 text-[10px] text-white/75">
          {attempt.correct} من {attempt.total}
        </p>
      </div>
      <span className="shrink-0 text-[26px] font-black text-white">{percent}%</span>
    </div>
  );
}

const badge = 'absolute top-2 end-2 z-10 rounded-full bg-[#0B0D16]/70 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur';

export function LessonResultCard({
  record,
  relative,
}: {
  record: LessonRecord;
  relative: string;
}) {
  const hasBody = Boolean(record.body?.beats?.length);
  const href = hasBody
    ? `/whiteboard?lesson=${encodeURIComponent(record.id)}`
    : `/whiteboard?q=${encodeURIComponent(record.question)}`;
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.035] transition hover:-translate-y-0.5 hover:border-[#9178E6]/40 hover:bg-white/[0.05]"
    >
      <div className="relative h-[132px] w-full overflow-hidden border-b border-white/[0.06]">
        <span className={badge}>درس</span>
        <LessonCover record={record} />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate text-[13.5px] font-bold text-white">{record.title}</h3>
        <p className="mt-1 line-clamp-2 min-h-[32px] text-[11px] leading-4 text-white/45">
          {record.summary || record.question}
        </p>
        <div className="mt-auto flex items-center justify-between pt-3 text-[10px] text-white/35">
          <span>{relative}</span>
          <span className="inline-flex items-center gap-1 font-semibold text-[#B9A8FF] transition group-hover:gap-2">
            افتح الدرس
            <ArrowLeft className="size-3" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function PlanResultCard({ plan, relative }: { plan: StudyPlan; relative: string }) {
  return (
    <Link
      href="/plans"
      className="group flex flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.035] transition hover:-translate-y-0.5 hover:border-[#9178E6]/40 hover:bg-white/[0.05]"
    >
      <div className="relative h-[132px] w-full overflow-hidden border-b border-white/[0.06]">
        <span className={badge}>خطة</span>
        <PlanCover plan={plan} />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="flex items-center gap-1.5 truncate text-[13.5px] font-bold text-white">
          <Target className="size-3.5 shrink-0 text-[#FB7E5B]" aria-hidden />
          {plan.subject}
        </h3>
        <p className="mt-1 line-clamp-2 min-h-[32px] text-[11px] leading-4 text-white/45">
          {plan.topics.length > 0 ? plan.topics.join(' · ') : 'خطة على قد امتحانك'}
        </p>
        <div className="mt-auto flex items-center justify-between pt-3 text-[10px] text-white/35">
          <span>{relative}</span>
          <span className="inline-flex items-center gap-1 font-semibold text-[#B9A8FF] transition group-hover:gap-2">
            افتح الخطة
            <ArrowLeft className="size-3" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function QuizResultCard({
  attempt,
  relative,
}: {
  attempt: QuizAttempt;
  relative: string;
}) {
  return (
    <Link
      href="/tests"
      className="group flex flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.035] transition hover:-translate-y-0.5 hover:border-[#9178E6]/40 hover:bg-white/[0.05]"
    >
      <div className="relative h-[132px] w-full overflow-hidden border-b border-white/[0.06]">
        <span className={badge}>اختبار</span>
        <QuizCover attempt={attempt} />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="flex items-center gap-1.5 truncate text-[13.5px] font-bold text-white">
          <FlaskConical className="size-3.5 shrink-0 text-[#00C386]" aria-hidden />
          {attempt.topic}
        </h3>
        <p className="mt-1 line-clamp-2 min-h-[32px] text-[11px] leading-4 text-white/45">
          {attempt.correct} إجابة صح من {attempt.total} · تقدر تحل تاني في أي وقت.
        </p>
        <div className="mt-auto flex items-center justify-between pt-3 text-[10px] text-white/35">
          <span>{relative}</span>
          <span className="inline-flex items-center gap-1 font-semibold text-[#B9A8FF] transition group-hover:gap-2">
            حل تاني
            <ArrowLeft className="size-3" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}
