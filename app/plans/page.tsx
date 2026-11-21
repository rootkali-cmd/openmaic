'use client';

/**
 * خطط المذاكرة — a real, local plan builder.
 *
 * The student gives a subject, an exam date and the topics; the page spreads
 * those topics over the days left, adds short review days, and keeps progress
 * in this browser. No AI is needed to build the schedule, so it works
 * instantly and honestly offline.
 */
import { CalendarDays, Check, Plus, Target, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { AppShell } from '@/components/shell/app-shell';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  daysUntil,
  deletePlan,
  getPlans,
  newId,
  savePlan,
  togglePlanTask,
  type PlanTask,
  type StudyPlan,
} from '@/lib/study-data';

function buildTasks(topics: string[], days: number): PlanTask[] {
  const clean = topics.map((topic) => topic.trim()).filter(Boolean);
  const list = clean.length > 0 ? clean : ['أساسيات المادة', 'أمثلة محلولة', 'مراجعة سريعة'];
  const tasks: PlanTask[] = [];

  for (let day = 0; day < days; day += 1) {
    // Contiguous chunk of topics per day, so the order still makes sense.
    const from = Math.floor((day * list.length) / days);
    const to = Math.max(from + 1, Math.floor(((day + 1) * list.length) / days));
    const chunk = list.slice(from, to);
    if (chunk.length === 0) {
      tasks.push({
        id: newId('task'),
        label: `يوم ${day + 1} · مراجعة وحل أسئلة`,
        done: false,
      });
    } else {
      chunk.forEach((topic) => {
        tasks.push({
          id: newId('task'),
          label: `يوم ${day + 1} · ${topic}`,
          done: false,
        });
      });
    }
    // A short recall session every third day keeps earlier material alive.
    if ((day + 1) % 3 === 0) {
      tasks.push({
        id: newId('task'),
        label: `يوم ${day + 1} · مراجعة سريعة لكل اللي فات`,
        done: false,
      });
    }
  }
  return tasks;
}

export default function StudyPlansPage() {
  const { t } = useI18n();
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const [subject, setSubject] = useState('');
  const [examDate, setExamDate] = useState('');
  const [topicsText, setTopicsText] = useState('');
  const [minutes, setMinutes] = useState(45);

  const reload = () => setPlans(getPlans());

  useEffect(() => {
    // Hydrate plans from localStorage after mount; SSR has no storage.
    reload();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setHydrated(true);
    if (getPlans().length === 0) setFormOpen(true);
  }, []);

  const create = () => {
    const cleanSubject = subject.trim();
    if (!cleanSubject) {
      toast.error('اكتب اسم المادة الأول.');
      return;
    }
    if (!examDate) {
      toast.error('اختار تاريخ الامتحان.');
      return;
    }
    const remaining = daysUntil(examDate);
    if (remaining !== null && remaining < 0) {
      toast.error('تاريخ الامتحان عدّى — اختار تاريخ جاي.');
      return;
    }
    const days = Math.min(21, Math.max(1, remaining ?? 1));
    const topics = topicsText
      .split(/[\n,،]+/)
      .map((topic) => topic.trim())
      .filter(Boolean)
      .slice(0, 24);

    const plan: StudyPlan = {
      id: newId('plan'),
      subject: cleanSubject,
      examDate,
      topics,
      minutesPerDay: minutes,
      createdAt: Date.now(),
      tasks: buildTasks(topics, days),
    };
    savePlan(plan);
    reload();
    setFormOpen(false);
    setSubject('');
    setExamDate('');
    setTopicsText('');
    toast.success('الخطة جاهزة — ابدأ بأول مهمة.');
  };

  const action = (
    <button
      type="button"
      onClick={() => setFormOpen((value) => !value)}
      className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[12px] font-bold text-[#0B0D16] transition hover:bg-white/90"
    >
      {formOpen ? <X className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
      {formOpen ? 'إلغاء' : 'خطة جديدة'}
    </button>
  );

  return (
    <AppShell title={t('shell.nav.plans')} actions={action}>
      <div className="h-full overflow-y-auto px-4 pb-16 pt-5 sm:px-6">
        <div className="mx-auto w-full max-w-[860px]">
          {formOpen ? (
            <section className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-[#9178E6]/15 text-[#B9A8FF]">
                  <Target className="size-4.5" aria-hidden />
                </span>
                <div>
                  <h2 className="text-[15px] font-black text-white">خطة على قد امتحانك</h2>
                  <p className="text-[11px] text-white/40">
                    اكتب المواضيع وسيب دارس يوزّعها على الأيام.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold text-white/55">المادة</span>
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value.slice(0, 60))}
                    placeholder="مثال: فيزياء — الوحدة الثالثة"
                    className="h-10 rounded-xl border border-white/10 bg-[#12141F] px-3 text-[13px] text-white outline-none transition placeholder:text-white/30 focus:border-[#9178E6]/60"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold text-white/55">تاريخ الامتحان</span>
                    <input
                      type="date"
                      value={examDate}
                      onChange={(event) => setExamDate(event.target.value)}
                      className="h-10 rounded-xl border border-white/10 bg-[#12141F] px-2 text-[12px] text-white outline-none transition focus:border-[#9178E6]/60 [color-scheme:dark]"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold text-white/55">دقايق/يوم</span>
                    <select
                      value={minutes}
                      onChange={(event) => setMinutes(Number(event.target.value))}
                      className="h-10 rounded-xl border border-white/10 bg-[#12141F] px-2 text-[12px] text-white outline-none transition focus:border-[#9178E6]/60"
                    >
                      {[30, 45, 60, 90, 120].map((value) => (
                        <option key={value} value={value}>
                          {value} دقيقة
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <label className="mt-3 flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-white/55">
                  المواضيع (سطر لكل موضوع أو بفاصلة)
                </span>
                <textarea
                  value={topicsText}
                  onChange={(event) => setTopicsText(event.target.value.slice(0, 1200))}
                  rows={4}
                  placeholder={'قانون نيوتن التاني\nالحركة في خط مستقيم\nالشغل والطاقة'}
                  className="resize-none rounded-xl border border-white/10 bg-[#12141F] px-3 py-2.5 text-[13px] leading-6 text-white outline-none transition placeholder:text-white/30 focus:border-[#9178E6]/60"
                />
              </label>

              <button
                type="button"
                onClick={create}
                className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#9178E6] px-5 text-[12.5px] font-bold text-white transition hover:bg-[#7C63D8]"
              >
                <CalendarDays className="size-4" aria-hidden />
                اعمل الخطة
              </button>
            </section>
          ) : null}

          {hydrated && plans.length === 0 && !formOpen ? (
            <div className="mt-10 flex flex-col items-center text-center">
              <span className="grid size-16 place-items-center rounded-3xl bg-[#9178E6]/12 text-[#9178E6]">
                <Target className="size-8" aria-hidden />
              </span>
              <h2 className="mt-5 text-[20px] font-black text-white">مفيش خطة لسه</h2>
              <p className="mt-2 max-w-sm text-[12.5px] leading-7 text-white/45">
                ابدأ بخطة واحدة، ودارس هيقسّم المواضيع على الأيام اللي فاضلة.
              </p>
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="mt-6 rounded-full bg-white px-6 py-2.5 text-[12.5px] font-bold text-[#0B0D16] transition hover:bg-white/90"
              >
                اعمل خطة مذاكرة
              </button>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} onChanged={reload} />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function PlanCard({ plan, onChanged }: { plan: StudyPlan; onChanged: () => void }) {
  const done = plan.tasks.filter((task) => task.done).length;
  const total = plan.tasks.length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const remaining = useMemo(() => daysUntil(plan.examDate), [plan.examDate]);

  const countdown =
    remaining === null
      ? 'من غير تاريخ'
      : remaining > 1
        ? `فاضل ${remaining} يوم`
        : remaining === 1
          ? 'الامتحان بكرة'
          : remaining === 0
            ? 'الامتحان النهاردة'
            : 'الامتحان عدّى';

  return (
    <article className="flex flex-col rounded-3xl border border-white/[0.08] bg-white/[0.035] p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-bold text-white">{plan.subject}</h3>
          <p className="mt-0.5 text-[10.5px] text-white/40">
            {countdown} · {plan.minutesPerDay} دقيقة/يوم
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            deletePlan(plan.id);
            onChanged();
            toast.info('اتشالت الخطة.');
          }}
          aria-label="حذف الخطة"
          className="grid size-7 place-items-center rounded-full text-white/30 transition hover:bg-white/[0.06] hover:text-[#FB7E5B]"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className="h-full rounded-full bg-[#00C386] transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-[10px] font-semibold tabular-nums text-white/45">
          {done}/{total}
        </span>
      </div>

      <ul className="mt-3 max-h-[230px] space-y-1 overflow-y-auto pe-1">
        {plan.tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => {
                togglePlanTask(plan.id, task.id);
                onChanged();
              }}
              className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-start transition hover:bg-white/[0.04]"
            >
              <span
                className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-[5px] border transition ${
                  task.done
                    ? 'border-[#00C386] bg-[#00C386] text-[#06251a]'
                    : 'border-white/20 text-transparent'
                }`}
              >
                <Check className="size-3" aria-hidden />
              </span>
              <span
                className={`text-[11.5px] leading-5 ${
                  task.done ? 'text-white/30 line-through' : 'text-white/70'
                }`}
              >
                {task.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
}
