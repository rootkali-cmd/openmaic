'use client';

/**
 * البحث — searches what this browser actually has: past lessons (with their
 * board), study plans and quiz attempts. Results are cards, not a bare list:
 * a lesson previews the board it will replay, a plan shows its progress and a
 * quiz its score. Anything not found can be asked directly on the whiteboard;
 * the page never shows invented results.
 */
import { ArrowLeft, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import {
  LessonResultCard,
  PlanResultCard,
  QuizResultCard,
} from '@/components/search/result-card';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  formatRelative,
  getLessons,
  getPlans,
  getQuizAttempts,
  STUDY_DATA_EVENT,
  type LessonRecord,
  type QuizAttempt,
  type StudyPlan,
} from '@/lib/study-data';

type Result =
  | { kind: 'lesson'; at: number; text: string; record: LessonRecord }
  | { kind: 'plan'; at: number; text: string; record: StudyPlan }
  | { kind: 'quiz'; at: number; text: string; record: QuizAttempt };

/** Arabic-friendly matching: diacritics and alef/ya variants are noise. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();
}

export default function SearchPage() {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const load = () => {
      const lessons: Result[] = getLessons().map((record) => ({
        kind: 'lesson',
        at: record.at,
        text: `${record.title} ${record.summary ?? ''} ${record.question}`,
        record,
      }));

      const plans: Result[] = getPlans().map((record) => ({
        kind: 'plan',
        at: record.createdAt,
        text: `${record.subject} ${record.topics.join(' ')}`,
        record,
      }));

      const quizzes: Result[] = getQuizAttempts().map((record) => ({
        kind: 'quiz',
        at: record.at,
        text: `${record.topic} ${record.correct}/${record.total}`,
        record,
      }));

      setResults([...lessons, ...plans, ...quizzes].sort((a, b) => b.at - a.at));
      setHydrated(true);
    };

    load();
    window.addEventListener(STUDY_DATA_EVENT, load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener(STUDY_DATA_EVENT, load);
      window.removeEventListener('storage', load);
    };
  }, []);

  const query = normalize(value);
  const visible = useMemo(() => {
    if (!query) return results.slice(0, 24);
    return results.filter((item) => normalize(item.text).includes(query)).slice(0, 30);
  }, [results, query]);

  const trends = [
    'sections.search.trend1',
    'sections.search.trend2',
    'sections.search.trend3',
    'sections.search.trend4',
  ];
  const askHref = `/whiteboard?q=${encodeURIComponent(value.trim())}`;
  const lessonCount = visible.filter((item) => item.kind === 'lesson').length;

  return (
    <AppShell title={t('sections.search.title')}>
      <div className="h-full overflow-y-auto px-4 pb-16 pt-6 sm:px-6">
        <div className="mx-auto w-full max-w-[980px]">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2.5 rounded-2xl border border-white/10 bg-[#12141F] px-4 py-3 transition focus-within:border-[#9178E6]/50">
              <Search className="size-4.5 shrink-0 text-white/40" aria-hidden />
              <input
                value={value}
                onChange={(event) => setValue(event.target.value.slice(0, 200))}
                placeholder={t('sections.search.placeholder')}
                aria-label={t('sections.search.title')}
                className="w-full bg-transparent text-[14px] text-white outline-none placeholder:text-white/35"
              />
            </div>
            {value.trim() ? (
              <Link
                href={askHref}
                aria-label="اسأل دارس"
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl bg-[#9178E6] px-3.5 text-[12px] font-bold text-white transition hover:bg-[#7C63D8]"
              >
                اسأل دارس
                <ArrowLeft className="size-3.5" aria-hidden />
              </Link>
            ) : null}
          </div>

          {!value.trim() ? (
            <>
              <p className="mt-6 text-center text-[11px] font-semibold text-white/35">
                {t('sections.search.trending')}
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {trends.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setValue(t(key))}
                    className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-[12px] font-semibold text-white/60 transition hover:border-[#9178E6]/40 hover:text-white"
                  >
                    <Sparkles className="size-3.5 text-[#00C386]" aria-hidden />
                    {t(key)}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <div className="mt-6 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-white/40">
              {query ? `نتايج «${value.trim()}»` : 'آخر نشاط ليك'}
            </p>
            {hydrated && visible.length > 0 ? (
              <span className="text-[10px] text-white/25">
                {visible.length} نتيجة{lessonCount > 0 ? ` · ${lessonCount} درس` : ''}
              </span>
            ) : null}
          </div>

          {hydrated && visible.length === 0 ? (
            <div className="mt-8 rounded-3xl border border-white/[0.08] bg-white/[0.03] px-6 py-10 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#9178E6]/12 text-[#9178E6]">
                <Search className="size-6" aria-hidden />
              </span>
              <h2 className="mt-4 text-[15px] font-bold text-white">
                {query ? 'مفيش حاجة مطابقة في نشاطك' : 'لسه مفيش نشاط محفوظ'}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-[12px] leading-6 text-white/45">
                {query
                  ? 'جرّب كلمة تانية، أو اسأل دارس نفس السؤال على السبورة.'
                  : 'أول درس أو خطة أو اختبار هيتسجل هنا تلقائيًا — وكل درس بيتحفظ بسبورته عشان تفتحه تاني من غير إعادة توليد.'}
              </p>
              {value.trim() ? (
                <Link
                  href={askHref}
                  className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-5 text-[12px] font-bold text-[#0B0D16] transition hover:bg-white/90"
                >
                  اسأل دارس: {value.trim().slice(0, 40)}
                  <ArrowLeft className="size-3.5" aria-hidden />
                </Link>
              ) : (
                <Link
                  href="/whiteboard"
                  className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-5 text-[12px] font-bold text-[#0B0D16] transition hover:bg-white/90"
                >
                  افتح السبورة
                  <ArrowLeft className="size-3.5" aria-hidden />
                </Link>
              )}
            </div>
          ) : (
            <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((item) => (
                <li key={`${item.kind}-${item.record.id}`}>
                  {item.kind === 'lesson' ? (
                    <LessonResultCard record={item.record} relative={formatRelative(item.at)} />
                  ) : item.kind === 'plan' ? (
                    <PlanResultCard plan={item.record} relative={formatRelative(item.at)} />
                  ) : (
                    <QuizResultCard attempt={item.record} relative={formatRelative(item.at)} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
