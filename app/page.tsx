'use client';

/**
 * دروسي — the tutor home.
 *
 * A chat with the teaching AI: the student asks, the tutor answers *in the
 * conversation* (the same teaching model that powers the board), and only
 * when the student chooses "watch it on the whiteboard" does the question
 * travel to /whiteboard?q=… . No silent redirects.
 */
import { ArrowUp, FileText, GraduationCap, ImagePlus, ListChecks, PenLine } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { DarsakMascot } from '@/components/mascot/darsak-mascot';
import { AppShell } from '@/components/shell/app-shell';
import { useI18n } from '@/lib/hooks/use-i18n';
import { addLesson } from '@/lib/study-data';
import { requestLesson } from '@/lib/whiteboard-engine/lesson-client';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  /** The question that produced this answer, for the board hand-off. */
  question?: string;
}

// Time-of-day greeting plumbing (see the call site): nothing to subscribe to,
// the browser hour, and a deterministic server hour that maps to the neutral
// greeting so hydration always agrees.
const subscribeToNothing = () => () => {};
const localHour = () => new Date().getHours();
const serverHour = () => 12;

export default function TutorPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [value, setValue] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Greeting depends on the student's local clock, but the HTML is rendered on
  // the server (UTC). useSyncExternalStore keeps the server snapshot stable and
  // swaps in the browser hour right after hydration, so the two never disagree
  // — a plain `new Date()` here caused a text hydration mismatch.
  const hour = useSyncExternalStore(subscribeToNothing, localHour, serverHour);
  const greeting =
    hour >= 5 && hour < 12
      ? t('tutor.greetingMorning')
      : hour >= 17 || hour < 5
        ? t('tutor.greetingEvening')
        : t('tutor.greeting');

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || busy) return;
      nextId.current += 1;
      setMessages((current) => [...current, { id: nextId.current, role: 'user', text: question }]);
      setValue('');
      setBusy(true);

      try {
        const data = await requestLesson({ question, locale });
        const answer = (data.beats ?? [])
          .map((beat) => (beat.speech ?? '').trim())
          .filter(Boolean)
          .join(' ');
        if (!answer) throw new Error('malformed answer');

        nextId.current += 1;
        setMessages((current) => [
          ...current,
          { id: nextId.current, role: 'assistant', text: answer, question },
        ]);
        addLesson({
          question,
          title: data.title?.trim() || question,
          summary: answer.slice(0, 160),
        });
      } catch {
        nextId.current += 1;
        setMessages((current) => [
          ...current,
          { id: nextId.current, role: 'assistant', text: t('tutor.answerError'), question },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, locale, t],
  );

  const openBoard = useCallback(
    (question?: string) => {
      if (question) router.push(`/whiteboard?q=${encodeURIComponent(question)}`);
      else if (value.trim()) router.push(`/whiteboard?q=${encodeURIComponent(value.trim())}`);
      else router.push('/whiteboard');
    },
    [router, value],
  );

  const chips: { key: string; icon: ReactNode; href?: string }[] = [
    {
      key: 'tutor.boardChip',
      icon: <GraduationCap className="size-4 text-[#9178E6]" aria-hidden />,
    },
    {
      key: 'tutor.upload',
      icon: <ImagePlus className="size-4 text-[#5FA0FC]" aria-hidden />,
      href: '/whiteboard',
    },
    {
      key: 'tutor.notes',
      icon: <FileText className="size-4 text-[#00C386]" aria-hidden />,
      href: '/plans',
    },
    {
      key: 'tutor.quiz',
      icon: <ListChecks className="size-4 text-[#E879C0]" aria-hidden />,
      href: '/tests',
    },
  ];

  const started = messages.length > 0;

  const askBar = (
    <div className="w-full">
      <div className="flex items-end gap-2 rounded-[26px] border border-white/10 bg-[#12141F]/95 p-2.5 shadow-[0_26px_60px_-28px_rgba(0,0,0,0.95)] backdrop-blur-xl transition focus-within:border-[#9178E6]/50">
        <textarea
          rows={1}
          value={value}
          onChange={(event) => setValue(event.target.value.slice(0, 600))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void ask(value);
            }
          }}
          placeholder={t('tutor.placeholder')}
          aria-label={t('tutor.placeholder')}
          className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-[14px] leading-6 text-white outline-none placeholder:text-white/35"
        />
        <button
          type="button"
          onClick={() => void ask(value)}
          disabled={!value.trim() || busy}
          aria-label={t('tutor.send')}
          title={t('tutor.send')}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[#9178E6] text-white transition hover:bg-[#7C63D8] disabled:bg-white/[0.08] disabled:text-white/30"
        >
          <ArrowUp className="size-4.5" aria-hidden />
        </button>
      </div>

      {!started ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {chips.map((chip) => {
            const label = t(chip.key);
            const className =
              'flex items-center gap-2 rounded-full border border-[#9178E6]/40 bg-[#9178E6]/12 px-3.5 py-2 text-[12px] font-semibold text-white transition hover:border-[#9178E6]/70 hover:bg-[#9178E6]/20';
            return chip.href ? (
              <Link key={chip.key} href={chip.href} className={className}>
                {chip.icon}
                {label}
              </Link>
            ) : (
              <button
                key={chip.key}
                type="button"
                onClick={() => openBoard()}
                aria-label={label}
                className={className}
              >
                {chip.icon}
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );

  return (
    <AppShell title={t('shell.nav.tutor')}>
      {!started ? (
        <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-6 pb-10">
          <div className="flex w-full max-w-[720px] flex-col items-center text-center">
            <DarsakMascot className="mb-5 size-20 drop-shadow-[0_18px_40px_rgba(114,46,209,0.45)]" />

            <h2 className="text-[clamp(1.5rem,3vw,2.1rem)] font-black leading-snug text-white">
              {greeting}
            </h2>
            <p className="mt-2.5 max-w-md text-[13.5px] leading-7 text-white/50">
              {t('tutor.subtitle')}
            </p>

            <div className="mt-8 w-full">{askBar}</div>

            <p className="mt-3 text-[10.5px] text-white/30">{t('tutor.soonHint')}</p>
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
            <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
              {messages.map((message) =>
                message.role === 'user' ? (
                  <div key={message.id} className="flex max-w-[85%] flex-col gap-1 self-end">
                    <span className="px-1 text-[10px] font-semibold text-white/30">
                      {t('tutor.you')}
                    </span>
                    <div className="rounded-2xl rounded-ee-md bg-[#9178E6] px-4 py-2.5 text-[13.5px] leading-7 text-white shadow-[0_10px_24px_-14px_rgba(145,120,230,0.9)]">
                      {message.text}
                    </div>
                  </div>
                ) : (
                  <div key={message.id} className="flex max-w-[88%] flex-col gap-1 self-start">
                    <span className="px-1 text-[10px] font-semibold text-[#9178E6]">
                      {t('tutor.teacher')}
                    </span>
                    <div className="rounded-2xl rounded-es-md border border-white/[0.06] bg-white/[0.05] px-4 py-3 text-[13.5px] leading-7 text-white/85">
                      {message.text}
                      {message.question && !message.text.includes(t('tutor.answerError')) ? (
                        <button
                          type="button"
                          onClick={() => openBoard(message.question)}
                          className="mt-2.5 flex items-center gap-1.5 rounded-full border border-[#9178E6]/35 bg-[#9178E6]/12 px-3 py-1.5 text-[11.5px] font-semibold text-[#C8BBFF] transition hover:border-[#9178E6]/70 hover:bg-[#9178E6]/20 hover:text-white"
                        >
                          <PenLine className="size-3.5" aria-hidden />
                          {t('tutor.openBoard')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ),
              )}

              {busy ? (
                <div className="flex flex-col gap-1 self-start">
                  <span className="px-1 text-[10px] font-semibold text-[#9178E6]">
                    {t('tutor.teacher')}
                  </span>
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-es-md border border-white/[0.06] bg-white/[0.05] px-4 py-3 text-[12.5px] text-white/55">
                    <span className="flex items-center gap-1" aria-hidden>
                      <i className="size-1.5 animate-bounce rounded-full bg-white/40 [animation-delay:0ms]" />
                      <i className="size-1.5 animate-bounce rounded-full bg-white/40 [animation-delay:150ms]" />
                      <i className="size-1.5 animate-bounce rounded-full bg-white/40 [animation-delay:300ms]" />
                    </span>
                    {t('tutor.thinking')}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Gradient hairline instead of a hard border: it reads as a soft
              fade under the composer rather than a second header line. */}
          <div className="relative px-4 py-3 md:px-8">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.09] to-transparent"
            />
            <div className="mx-auto w-full max-w-[760px]">{askBar}</div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
