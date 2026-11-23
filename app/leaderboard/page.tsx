'use client';

/**
 * لوحة الصدارة — personal progress built only from real local activity.
 *
 * There is no shared account store behind the app yet, so this page does not
 * claim a cross-user ranking. It shows the student's own lessons, focus time,
 * quiz scores and a real weekly activity chart.
 */
import {
  ArrowLeft,
  Award,
  Flame,
  FlaskConical,
  GraduationCap,
  Play,
  Timer,
  Trophy,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { FOCUS_OPEN_EVENT } from '@/components/shell/study-timer';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  activityByDay,
  currentStreak,
  getFocusSessions,
  getLessons,
  getQuizAttempts,
  STUDY_DATA_EVENT,
  totalFocusMinutes,
  type DayBucket,
} from '@/lib/study-data';

interface Stats {
  lessons: number;
  quizzes: number;
  focusMinutes: number;
  average: number | null;
  streak: number;
  days: DayBucket[];
}

const EMPTY: Stats = {
  lessons: 0,
  quizzes: 0,
  focusMinutes: 0,
  average: null,
  streak: 0,
  days: [],
};

interface SharedRow {
  rank: number;
  name: string;
  universityNameAr: string | null;
  major: string | null;
  lessons: number;
  quizzes: number;
  focusMinutes: number;
  average: number | null;
  isMe: boolean;
}

function readStats(): Stats {
  const attempts = getQuizAttempts();
  const answered = attempts.reduce((sum, item) => sum + item.correct, 0);
  const total = attempts.reduce((sum, item) => sum + item.total, 0);
  return {
    lessons: getLessons().length,
    quizzes: attempts.length,
    focusMinutes: totalFocusMinutes(),
    average: total > 0 ? Math.round((answered / total) * 100) : null,
    streak: currentStreak(),
    days: activityByDay(7),
  };
}

export default function LeaderboardPage() {
  const { t } = useI18n();
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [shared, setShared] = useState<SharedRow[]>([]);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const load = () => {
      setStats(readStats());
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

  // Cross-user ranking from the Darsak API (real synced activity only).
  // Refresh on mount, on local activity, and periodically while visible.
  useEffect(() => {
    let cancelled = false;
    const loadBoard = () => {
      void fetch('/api/host/leaderboard', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { rows?: SharedRow[]; signedIn?: boolean } | null) => {
          if (cancelled || !data) return;
          setShared(Array.isArray(data.rows) ? data.rows : []);
          setSignedIn(Boolean(data.signedIn));
        })
        .catch(() => undefined);
    };
    loadBoard();
    const onActivity = () => window.setTimeout(loadBoard, 3000);
    const interval = window.setInterval(loadBoard, 15000);
    window.addEventListener(STUDY_DATA_EVENT, onActivity);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener(STUDY_DATA_EVENT, onActivity);
    };
  }, []);

  const focusSessions = hydrated ? getFocusSessions().length : 0;
  const hasActivity = stats.lessons + stats.quizzes + focusSessions > 0;
  const peak = Math.max(1, ...stats.days.map((day) => day.lessons + day.quizzes));

  const achievements = [
    {
      id: 'first-lesson',
      label: 'أول درس على السبورة',
      done: stats.lessons >= 1,
      icon: GraduationCap,
    },
    { id: 'five-lessons', label: '٥ دروس مكتملة', done: stats.lessons >= 5, icon: GraduationCap },
    { id: 'ten-lessons', label: '١٠ دروس مكتملة', done: stats.lessons >= 10, icon: Trophy },
    { id: 'first-quiz', label: 'أول اختبار تجريبي', done: stats.quizzes >= 1, icon: FlaskConical },
    {
      id: 'good-average',
      label: 'متوسط ٨٠٪ في الاختبارات',
      done: (stats.average ?? 0) >= 80 && stats.quizzes >= 2,
      icon: Award,
    },
    {
      id: 'focus-hour',
      label: 'ساعة تركيز كاملة',
      done: stats.focusMinutes >= 60,
      icon: Timer,
    },
    { id: 'streak-three', label: '٣ أيام متتالية', done: stats.streak >= 3, icon: Flame },
  ];

  return (
    <AppShell title={t('shell.nav.leaderboard')}>
      <div className="h-full overflow-y-auto px-4 pb-16 pt-5 sm:px-6">
        <div className="mx-auto w-full max-w-[860px]">
          <section className="overflow-hidden rounded-3xl border border-[#9178E6]/25 bg-gradient-to-br from-[#9178E6]/20 via-[#12141F] to-[#12141F] p-5 sm:p-6">
            <div className="flex flex-wrap items-start gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-[#9178E6] text-white shadow-[0_10px_30px_-12px_#9178E6]">
                <Trophy className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="text-[18px] font-black text-white">تقدمك انت</h1>
                <p className="mt-1 max-w-xl text-[11.5px] leading-6 text-white/50">
                  {signedIn
                    ? 'كل رقم هنا جاي من نشاطك الحقيقي، والترتيب تحت بيجمع نفس النشاط من كل الطلاب المسجّلين — مفيش نقاط متخترعة.'
                    : 'كل رقم هنا جاي من نشاطك الحقيقي على الجهاز ده. سجّل من دارس عشان نشاطك يتحسب في ترتيب الطلاب.'}
                </p>
              </div>
              {stats.streak > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FB7E5B]/15 px-3 py-1.5 text-[11px] font-bold text-[#FFB4A0]">
                  <Flame className="size-3.5" aria-hidden />
                  {stats.streak} يوم متتالي
                </span>
              ) : null}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="دروس" value={`${stats.lessons}`} hint="محفوظة في نشاطك" />
              <Stat label="دقايق تركيز" value={`${stats.focusMinutes}`} hint="من مؤقت التركيز" />
              <Stat label="اختبارات" value={`${stats.quizzes}`} hint="محاولات مصححة" />
              <Stat
                label="متوسط الدرجات"
                value={stats.average === null ? '—' : `${stats.average}%`}
                hint={stats.average === null ? 'لسه مفيش اختبار' : 'على كل المحاولات'}
              />
            </div>
          </section>

          {hydrated && !hasActivity ? (
            <div className="mt-4 rounded-3xl border border-white/[0.08] bg-white/[0.03] px-6 py-9 text-center">
              <p className="text-[13px] font-bold text-white">لسه مفيش نشاط محفوظ</p>
              <p className="mx-auto mt-2 max-w-sm text-[11.5px] leading-6 text-white/45">
                اسأل دارس أول سؤال، أو ابدأ جلسة تركيز ١٠ دقايق، وكل رقم هنا هيتحسب لوحده.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Link
                  href="/whiteboard"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-5 text-[12px] font-bold text-[#0B0D16] transition hover:bg-white/90"
                >
                  اسأل دارس
                  <ArrowLeft className="size-3.5" aria-hidden />
                </Link>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event(FOCUS_OPEN_EVENT))}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/20 px-5 text-[12px] font-semibold text-white transition hover:bg-white/[0.06]"
                >
                  <Play className="size-3.5" aria-hidden />
                  ابدأ تركيز
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <section className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[13px] font-bold text-white">آخر ٧ أيام</h2>
                <span className="text-[10px] text-white/35">دروس + اختبارات</span>
              </div>
              <div className="mt-5 flex h-[150px] items-end gap-2">
                {stats.days.map((day) => {
                  const total = day.lessons + day.quizzes;
                  const height = total === 0 ? 4 : Math.max(10, (total / peak) * 100);
                  return (
                    <div key={day.key} className="flex h-full flex-1 flex-col justify-end gap-1.5">
                      <div
                        title={`${total} نشاط`}
                        className={`w-full rounded-t-md transition-all ${
                          total > 0 ? 'bg-[#9178E6]' : 'bg-white/[0.07]'
                        }`}
                        style={{ height: `${height}%` }}
                      />
                      <span className="text-center text-[9px] text-white/35">{day.label}</span>
                    </div>
                  );
                })}
                {stats.days.length === 0
                  ? Array.from({ length: 7 }, (_, index) => (
                      <div
                        key={index}
                        className="h-1 flex-1 rounded-t-md bg-white/[0.07]"
                        aria-hidden
                      />
                    ))
                  : null}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3 text-[10.5px] text-white/40">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-sm bg-[#9178E6]" aria-hidden />
                  نشاط مسجّل
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Timer className="size-3 text-[#00C386]" aria-hidden />
                  {stats.focusMinutes} دقيقة تركيز إجمالًا
                </span>
              </div>
            </section>

            <section className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5">
              <h2 className="text-[13px] font-bold text-white">إنجازات حقيقية</h2>
              <ul className="mt-3 space-y-1.5">
                {achievements.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li
                      key={item.id}
                      className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${
                        item.done ? 'bg-[#00C386]/[0.08]' : 'bg-white/[0.02]'
                      }`}
                    >
                      <span
                        className={`grid size-7 shrink-0 place-items-center rounded-lg ${
                          item.done
                            ? 'bg-[#00C386]/15 text-[#7BE8BE]'
                            : 'bg-white/[0.05] text-white/25'
                        }`}
                      >
                        <Icon className="size-3.5" aria-hidden />
                      </span>
                      <span
                        className={`flex-1 text-[11.5px] ${
                          item.done ? 'font-semibold text-white/80' : 'text-white/35'
                        }`}
                      >
                        {item.label}
                      </span>
                      <span
                        className={`text-[9px] font-bold ${
                          item.done ? 'text-[#7BE8BE]' : 'text-white/20'
                        }`}
                      >
                        {item.done ? 'تم' : 'لسه'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          <section className="mt-4 rounded-3xl border border-white/[0.08] bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[13px] font-bold text-white">
                <Users className="size-4 text-[#9178E6]" aria-hidden />
                ترتيب الطلاب
              </h2>
              <span className="text-[10px] text-white/35">
                {signedIn ? 'نشاط حقيقي متزامن من الحسابات' : 'سجّل عشان تظهر في الترتيب'}
              </span>
            </div>
            {shared.length === 0 ? (
              <p className="mt-4 text-[11.5px] leading-6 text-white/45">
                لسه مفيش نشاط متزامن من طلاب تانيين. أول ما حد يسجّل ويذاكر، هيظهر هنا بترتيب حقيقي.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {shared.map((row) => (
                  <li
                    key={`${row.rank}-${row.name}`}
                    className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${
                      row.isMe ? 'bg-[#9178E6]/[0.14] ring-1 ring-[#9178E6]/40' : 'bg-white/[0.02]'
                    }`}
                  >
                    <span
                      className={`grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-black tabular-nums ${
                        row.rank <= 3
                          ? 'bg-[#FFD84D]/15 text-[#FFE9A3]'
                          : 'bg-white/[0.05] text-white/40'
                      }`}
                    >
                      {row.rank}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-semibold text-white/85">
                        {row.name}
                        {row.isMe ? ' (انت)' : ''}
                      </span>
                      <span className="block truncate text-[9.5px] text-white/35">
                        {[row.universityNameAr, row.major].filter(Boolean).join(' · ') || 'طالب'}
                      </span>
                    </span>
                    <span className="text-end text-[9.5px] leading-4 text-white/45">
                      <span className="block font-bold text-white/75">
                        {row.focusMinutes} د تركيز
                      </span>
                      <span className="block">
                        {row.lessons} درس · {row.quizzes} اختبار
                        {row.average !== null ? ` · ${row.average}%` : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(FOCUS_OPEN_EVENT))}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#9178E6] px-4 text-[11.5px] font-bold text-white transition hover:bg-[#7C63D8]"
            >
              <Timer className="size-3.5" aria-hidden />
              ابدأ جلسة تركيز
            </button>
            <Link
              href="/tests"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/20 px-4 text-[11.5px] font-semibold text-white transition hover:bg-white/[0.06]"
            >
              <FlaskConical className="size-3.5" aria-hidden />
              اعمل اختبار
            </Link>
            <Link
              href="/plans"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/20 px-4 text-[11.5px] font-semibold text-white transition hover:bg-white/[0.06]"
            >
              خطط مذاكرة
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0B0D16]/45 px-3 py-2.5">
      <p className="text-[10px] font-semibold text-white/40">{label}</p>
      <p className="mt-0.5 text-[22px] font-black leading-tight tabular-nums text-white">{value}</p>
      <p className="mt-0.5 truncate text-[9px] text-white/25">{hint}</p>
    </div>
  );
}
