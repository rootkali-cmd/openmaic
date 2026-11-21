'use client';

/**
 * اختبارات — generate a real multiple-choice quiz on any topic, answer it,
 * and get the score with an explanation per question. Attempts are kept in
 * this browser and feed the personal progress view.
 */
import {
  ArrowLeft,
  Check,
  CircleAlert,
  FlaskConical,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { AppShell } from '@/components/shell/app-shell';
import { useI18n } from '@/lib/hooks/use-i18n';
import { addQuizAttempt, formatRelative, getQuizAttempts, type QuizAttempt } from '@/lib/study-data';

interface Question {
  q: string;
  options: string[];
  answer: number;
  explain: string;
}

interface QuizPayload {
  title: string;
  questions: Question[];
}

type Phase = 'setup' | 'loading' | 'quiz' | 'result';

export default function TestsPage() {
  const { t } = useI18n();

  const [phase, setPhase] = useState<Phase>('setup');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState('متوسط');
  const [quiz, setQuiz] = useState<QuizPayload | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);

  useEffect(() => {
    setAttempts(getQuizAttempts().slice(0, 4));
  }, []);

  const generate = async () => {
    const clean = topic.trim();
    if (!clean) {
      toast.error('اكتب الموضوع الأول.');
      return;
    }
    setPhase('loading');
    setError('');
    try {
      const response = await fetch('/api/quiz/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: clean, count, difficulty }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        title?: string;
        questions?: Question[];
        error?: string;
        errorCode?: string;
      };
      if (!response.ok || !payload.questions?.length) {
        throw new Error(
          typeof payload.error === 'string' && payload.error
            ? payload.error
            : 'مقدرناش نولّد الاختبار دلوقتي.',
        );
      }
      setQuiz({ title: payload.title ?? clean, questions: payload.questions });
      setAnswers({});
      setPhase('quiz');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'مقدرناش نولّد الاختبار دلوقتي.');
      setPhase('setup');
    }
  };

  const submit = () => {
    if (!quiz) return;
    const correct = quiz.questions.reduce(
      (sum, question, index) => sum + (answers[index] === question.answer ? 1 : 0),
      0,
    );
    addQuizAttempt({ topic: quiz.title, total: quiz.questions.length, correct });
    setAttempts(getQuizAttempts().slice(0, 4));
    setPhase('result');
  };

  const answeredCount = quiz ? Object.keys(answers).length : 0;
  const correctCount = quiz
    ? quiz.questions.reduce(
        (sum, question, index) => sum + (answers[index] === question.answer ? 1 : 0),
        0,
      )
    : 0;
  const percent = quiz ? Math.round((correctCount / quiz.questions.length) * 100) : 0;

  return (
    <AppShell title={t('shell.nav.tests')}>
      <div className="h-full overflow-y-auto px-4 pb-16 pt-5 sm:px-6">
        <div className="mx-auto w-full max-w-[760px]">
          {phase === 'setup' || phase === 'loading' ? (
            <>
              <section className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6">
                <div className="flex items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-xl bg-[#FB7E5B]/15 text-[#FB7E5B]">
                    <FlaskConical className="size-4.5" aria-hidden />
                  </span>
                  <div>
                    <h1 className="text-[15px] font-black text-white">اختبر نفسك قبل الامتحان</h1>
                    <p className="text-[11px] text-white/40">
                      دارس يكتب أسئلة على أي موضوع ويصحّحها معاك فورًا.
                    </p>
                  </div>
                </div>

                <label className="mt-5 flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold text-white/55">الموضوع</span>
                  <input
                    value={topic}
                    onChange={(event) => setTopic(event.target.value.slice(0, 200))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && phase === 'setup') void generate();
                    }}
                    placeholder="مثال: قانون نيوتن التاني والحركة"
                    className="h-11 rounded-xl border border-white/10 bg-[#12141F] px-3.5 text-[13px] text-white outline-none transition placeholder:text-white/30 focus:border-[#9178E6]/60"
                  />
                </label>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold text-white/55">عدد الأسئلة</span>
                    <select
                      value={count}
                      onChange={(event) => setCount(Number(event.target.value))}
                      className="h-10 rounded-xl border border-white/10 bg-[#12141F] px-2 text-[12px] text-white outline-none focus:border-[#9178E6]/60"
                    >
                      {[3, 5, 8, 10, 12].map((value) => (
                        <option key={value} value={value}>
                          {value} أسئلة
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold text-white/55">المستوى</span>
                    <select
                      value={difficulty}
                      onChange={(event) => setDifficulty(event.target.value)}
                      className="h-10 rounded-xl border border-white/10 bg-[#12141F] px-2 text-[12px] text-white outline-none focus:border-[#9178E6]/60"
                    >
                      {['سهل', 'متوسط', 'صعب'].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {error ? (
                  <p className="mt-3 flex items-start gap-2 rounded-xl bg-[#FB7E5B]/10 px-3 py-2.5 text-[11.5px] leading-5 text-[#FFB4A0]">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {error}
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={() => void generate()}
                  disabled={phase === 'loading'}
                  className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#9178E6] px-5 text-[12.5px] font-bold text-white transition hover:bg-[#7C63D8] disabled:opacity-60"
                >
                  {phase === 'loading' ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="size-4" aria-hidden />
                  )}
                  {phase === 'loading' ? 'بنكتب الأسئلة…' : 'ولّد الاختبار'}
                </button>
                {phase === 'loading' ? (
                  <p className="mt-2 text-[10.5px] text-white/35">
                    الموديل بيكتب أسئلة مخصوصة لموضوعك — ثواني.
                  </p>
                ) : null}
              </section>

              {attempts.length > 0 ? (
                <section className="mt-4 rounded-3xl border border-white/[0.08] bg-white/[0.025] p-4">
                  <h2 className="text-[12px] font-bold text-white/70">آخر محاولاتك</h2>
                  <ul className="mt-2 space-y-1.5">
                    {attempts.map((attempt) => (
                      <li
                        key={attempt.id}
                        className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-[11.5px] text-white/65">
                          {attempt.topic}
                        </span>
                        <span className="text-[10px] text-white/35">{formatRelative(attempt.at)}</span>
                        <span className="rounded-full bg-[#00C386]/15 px-2 py-0.5 text-[10px] font-bold text-[#7BE8BE]">
                          {attempt.correct}/{attempt.total}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}

          {phase === 'quiz' && quiz ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 flex-1 truncate text-[16px] font-black text-white">
                  {quiz.title}
                </h1>
                <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[10.5px] font-semibold text-white/55">
                  {answeredCount}/{quiz.questions.length} متجاوب
                </span>
              </div>

              <ol className="mt-4 space-y-3">
                {quiz.questions.map((question, questionIndex) => (
                  <li
                    key={`${questionIndex}-${question.q.slice(0, 20)}`}
                    className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4"
                  >
                    <p className="text-[13px] font-semibold leading-6 text-white">
                      <span className="me-1.5 text-[#9178E6]">{questionIndex + 1}.</span>
                      {question.q}
                    </p>
                    <div className="mt-3 grid gap-1.5">
                      {question.options.map((option, optionIndex) => {
                        const selected = answers[questionIndex] === optionIndex;
                        return (
                          <button
                            key={`${optionIndex}-${option.slice(0, 16)}`}
                            type="button"
                            onClick={() =>
                              setAnswers((current) => ({ ...current, [questionIndex]: optionIndex }))
                            }
                            className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-start text-[12px] transition ${
                              selected
                                ? 'border-[#9178E6]/70 bg-[#9178E6]/15 text-white'
                                : 'border-white/10 bg-[#12141F] text-white/60 hover:border-white/20 hover:text-white/85'
                            }`}
                          >
                            <span
                              className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                                selected ? 'bg-[#9178E6] text-white' : 'bg-white/[0.07] text-white/45'
                              }`}
                            >
                              {['أ', 'ب', 'ج', 'د'][optionIndex]}
                            </span>
                            <span className="flex-1 leading-5">{option}</span>
                          </button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ol>

              <div className="sticky bottom-3 mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-[#12141F]/95 p-2.5 backdrop-blur">
                <button
                  type="button"
                  onClick={() => {
                    setPhase('setup');
                    setQuiz(null);
                    setAnswers({});
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[11.5px] font-semibold text-white/55 transition hover:bg-white/[0.06] hover:text-white"
                >
                  <X className="size-3.5" aria-hidden />
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={answeredCount < quiz.questions.length}
                  className="ms-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-[#00C386] px-4 text-[12px] font-bold text-[#06251a] transition hover:bg-[#23d69c] disabled:bg-white/[0.08] disabled:text-white/30"
                >
                  <Check className="size-3.5" aria-hidden />
                  صحّح الاختبار
                </button>
              </div>
            </>
          ) : null}

          {phase === 'result' && quiz ? (
            <>
              <section className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#9178E6]/20 to-white/[0.02] p-6 text-center">
                <p className="text-[11px] font-semibold text-white/50">{quiz.title}</p>
                <p className="mt-2 text-[44px] font-black leading-none text-white">{percent}%</p>
                <p className="mt-1 text-[12px] text-white/55">
                  جاوبت {correctCount} صح من {quiz.questions.length}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAnswers({});
                      setPhase('quiz');
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[11.5px] font-bold text-[#0B0D16] transition hover:bg-white/90"
                  >
                    <RefreshCw className="size-3.5" aria-hidden />
                    حل تاني
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPhase('setup');
                      setQuiz(null);
                      setAnswers({});
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/20 px-4 text-[11.5px] font-semibold text-white transition hover:bg-white/[0.06]"
                  >
                    اختبار جديد
                  </button>
                  <Link
                    href={`/whiteboard?q=${encodeURIComponent(`اشرحلي ${quiz.title}`)}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/20 px-4 text-[11.5px] font-semibold text-white transition hover:bg-white/[0.06]"
                  >
                    اسأل دارس
                    <ArrowLeft className="size-3.5" aria-hidden />
                  </Link>
                </div>
              </section>

              <ol className="mt-4 space-y-3">
                {quiz.questions.map((question, index) => {
                  const chosen = answers[index];
                  const right = chosen === question.answer;
                  return (
                    <li
                      key={`${index}-review`}
                      className={`rounded-2xl border p-4 ${
                        right
                          ? 'border-[#00C386]/25 bg-[#00C386]/[0.06]'
                          : 'border-[#FB7E5B]/25 bg-[#FB7E5B]/[0.06]'
                      }`}
                    >
                      <p className="flex items-start gap-2 text-[12.5px] font-semibold leading-6 text-white">
                        <span className={right ? 'text-[#00C386]' : 'text-[#FB7E5B]'}>
                          {right ? (
                            <Check className="mt-1 size-3.5" aria-hidden />
                          ) : (
                            <X className="mt-1 size-3.5" aria-hidden />
                          )}
                        </span>
                        <span>
                          {index + 1}. {question.q}
                        </span>
                      </p>
                      <p className="mt-2 text-[11.5px] leading-6 text-white/60">
                        الإجابة الصح:{' '}
                        <span className="font-semibold text-white/85">
                          {question.options[question.answer]}
                        </span>
                        {!right && chosen !== undefined ? (
                          <>
                            {' '}
                            · اخترت:{' '}
                            <span className="text-[#FFB4A0]">{question.options[chosen]}</span>
                          </>
                        ) : null}
                      </p>
                      {question.explain ? (
                        <p className="mt-1 text-[11px] leading-6 text-white/40">{question.explain}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
