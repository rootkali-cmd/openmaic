'use client';

/**
 * Floating question bar — the single place the student talks to the teacher:
 * type, attach (coming soon), dictate, toggle the voice reply, send. While a
 * lesson runs the send button becomes pause/resume so the controls the spec
 * asks for are always one tap away.
 *
 * The mic uses the browser's Speech Recognition with the platform ASR hook;
 * hosted Arabic ASR can slot in behind the same interface later.
 */
import { ImagePlus, Mic, MicOff, Pause, Play, Send, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useBrowserASR } from '@/lib/hooks/use-browser-asr';
import { useI18n } from '@/lib/hooks/use-i18n';
import { usePlayerStore } from '@/lib/whiteboard-engine/player';

interface InputBarProps {
  onAsk: (question: string) => void;
  busy: boolean;
}

export function InputBar({ onAsk, busy }: InputBarProps) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const status = usePlayerStore((s) => s.status);
  const muted = usePlayerStore((s) => s.muted);
  const setMuted = usePlayerStore((s) => s.setMuted);
  const toggle = usePlayerStore((s) => s.toggle);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { isSupported: asrSupported, isListening, interimTranscript, startListening, stopListening } =
    useBrowserASR({
      language: 'ar-SA',
      onTranscription: (text) => {
        setValue((current) => (current ? `${current} ${text}` : text).slice(0, 600));
      },
    });

  // Example chips on the empty board fill the box through a page-level event.
  useEffect(() => {
    const onExample = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setValue(detail);
      textareaRef.current?.focus();
    };
    window.addEventListener('wb-example', onExample);
    return () => window.removeEventListener('wb-example', onExample);
  }, []);

  const submit = useCallback(() => {
    const question = value.trim();
    if (!question || busy) return;
    onAsk(question);
    setValue('');
  }, [value, busy, onAsk]);

  const playing = status === 'playing';
  const paused = status === 'paused';

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-[720px]">
        <div
          className={`flex items-end gap-1.5 rounded-[26px] border bg-[#12141F]/97 p-2 shadow-[0_26px_60px_-28px_rgba(0,0,0,0.95)] transition ${
            isListening ? 'border-[#FB7E5B]/70 ring-4 ring-[#FB7E5B]/15' : 'border-white/10'
          }`}
        >
          <button
            type="button"
            aria-label={t('wb.attach')}
            title={t('wb.attachSoon')}
            disabled
            className="grid size-9 shrink-0 place-items-center rounded-full text-white/40 transition hover:bg-white/[0.06] disabled:opacity-40"
          >
            <ImagePlus className="size-4.5" aria-hidden />
          </button>

          <textarea
            ref={textareaRef}
            rows={1}
            value={isListening && interimTranscript ? `${value} ${interimTranscript}` : value}
            onChange={(event) => setValue(event.target.value.slice(0, 600))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={isListening ? t('wb.listening') : t('wb.placeholder')}
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-[13.5px] leading-6 text-white outline-none placeholder:text-white/35"
          />

          <button
            type="button"
            aria-label={muted ? t('wb.voiceOff') : t('wb.voiceOn')}
            aria-pressed={!muted}
            onClick={() => setMuted(!muted)}
            title={muted ? t('wb.voiceOff') : t('wb.voiceOn')}
            className={`grid size-9 shrink-0 place-items-center rounded-full transition ${
              muted
                ? 'text-white/40 hover:bg-white/[0.06]'
                : 'bg-[#9178E6]/15 text-[#B9A8FF] hover:bg-[#9178E6]/25'
            }`}
          >
            {muted ? <VolumeX className="size-4.5" /> : <Volume2 className="size-4.5" />}
          </button>

          {asrSupported ? (
            <button
              type="button"
              aria-label={isListening ? t('wb.micStop') : t('wb.mic')}
              aria-pressed={isListening}
              onClick={() => (isListening ? stopListening() : startListening())}
              className={`grid size-9 shrink-0 place-items-center rounded-full transition ${
                isListening
                  ? 'bg-[#FB7E5B] text-[#2E0F06] shadow-[0_0_0_4px_rgba(251,126,91,0.25)]'
                  : 'text-white/55 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              {isListening ? <MicOff className="size-4.5" /> : <Mic className="size-4.5" />}
            </button>
          ) : null}

          {playing || paused ? (
            <button
              type="button"
              onClick={toggle}
              aria-label={paused ? t('wb.resume') : t('wb.pause')}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.08] text-white transition hover:bg-white/[0.14]"
            >
              {paused ? <Play className="size-4.5" /> : <Pause className="size-4.5" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!value.trim() || busy}
              aria-label={t('wb.send')}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-[#9178E6] text-white transition hover:bg-[#7C63D8] disabled:bg-white/[0.08] disabled:text-white/30"
            >
              <Send className="size-4.5 -scale-x-100" aria-hidden />
            </button>
          )}
        </div>

        <p className="mt-2 text-center text-[10.5px] text-white/35">
          {busy ? t('wb.thinking') : t('wb.hint')}
        </p>
      </div>
    </div>
  );
}