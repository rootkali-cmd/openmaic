'use client';

/**
 * Floating question bar — the single place the student talks to the teacher:
 * type, attach a photo of the exercise, dictate, toggle the voice reply, send.
 * Send stays available while a lesson plays: asking mid-lesson interrupts the
 * teacher, answers, then resumes — pause/resume lives in the HUD.
 *
 * Attached images are downscaled here (max 1280px, JPEG) before they travel,
 * so a phone photo stays a small request. The teaching model reads them.
 */
import { ImagePlus, Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useBrowserASR } from '@/lib/hooks/use-browser-asr';
import { useI18n } from '@/lib/hooks/use-i18n';
import { usePlayerStore } from '@/lib/whiteboard-engine/player';

export interface AttachedImage {
  dataUrl: string;
  name: string;
}

interface InputBarProps {
  onAsk: (question: string, image?: AttachedImage) => void;
  busy: boolean;
}

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_EDGE = 1280;

/** Read a picked file and shrink it to a data URL the lesson route accepts. */
async function prepareImage(file: File): Promise<AttachedImage> {
  if (!file.type.startsWith('image/')) throw new Error('not an image');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('image too large');

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('decode failed'));
    element.src = dataUrl;
  });

  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return { dataUrl, name: file.name };
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  // Keep small scans crisp; the route accepts up to ~6 MB of binary.
  const compressed = canvas.toDataURL('image/jpeg', 0.82);
  return { dataUrl: compressed, name: file.name };
}

export function InputBar({ onAsk, busy }: InputBarProps) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [image, setImage] = useState<AttachedImage | null>(null);
  const [reading, setReading] = useState(false);
  const [attachError, setAttachError] = useState('');
  const muted = usePlayerStore((s) => s.muted);
  const setMuted = usePlayerStore((s) => s.setMuted);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const onFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setAttachError('');
    setReading(true);
    try {
      setImage(await prepareImage(file));
    } catch {
      setAttachError('مقدرناش نقرا الصورة دي — جرّب صورة تانية (JPG أو PNG).');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, []);

  const submit = useCallback(() => {
    const question = value.trim() || (image ? 'اشرح لي اللي في الصورة دي.' : '');
    if (!question || busy || reading) return;
    onAsk(question, image ?? undefined);
    setValue('');
    setImage(null);
  }, [value, busy, reading, image, onAsk]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-[720px]">
        <div
          className={`rounded-[26px] border bg-[#12141F]/97 p-2 shadow-[0_26px_60px_-28px_rgba(0,0,0,0.95)] transition ${
            isListening ? 'border-[#FB7E5B]/70 ring-4 ring-[#FB7E5B]/15' : 'border-white/10'
          }`}
        >
          {image || reading ? (
            <div className="mb-1.5 flex items-center gap-2 rounded-2xl bg-white/[0.04] p-1.5 ps-2">
              {image ? (
                <img
                  src={image.dataUrl}
                  alt={image.name}
                  className="size-10 rounded-lg object-cover ring-1 ring-white/10"
                />
              ) : (
                <span className="grid size-10 place-items-center rounded-lg bg-white/[0.06]">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-white/20 border-t-[#9178E6]" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-white/70">
                  {reading ? 'بنجهز الصورة…' : image?.name}
                </p>
                <p className="text-[9.5px] text-white/35">
                  {reading ? 'هنضغطها قبل الإرسال' : 'المدرس هيقرا الصورة ويشرحها'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImage(null)}
                aria-label="إزالة الصورة"
                className="grid size-7 shrink-0 place-items-center rounded-full text-white/40 transition hover:bg-white/[0.08] hover:text-white"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          ) : null}

          <div className="flex items-end gap-1.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
            <button
              type="button"
              aria-label={t('wb.attach')}
              title={t('wb.attach')}
              onClick={() => fileRef.current?.click()}
              disabled={reading}
              className={`grid size-9 shrink-0 place-items-center rounded-full transition hover:bg-white/[0.06] disabled:opacity-40 ${
                image ? 'text-[#B9A8FF]' : 'text-white/40'
              }`}
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

            <button
              type="button"
              onClick={submit}
              disabled={(!value.trim() && !image) || busy || reading}
              aria-label={t('wb.send')}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-[#9178E6] text-white transition hover:bg-[#7C63D8] disabled:bg-white/[0.08] disabled:text-white/30"
            >
              <Send className="size-4.5 -scale-x-100" aria-hidden />
            </button>
          </div>
        </div>

        <p className="mt-2 text-center text-[10.5px] text-white/35">
          {attachError
            ? attachError
            : busy
              ? t('wb.thinking')
              : image
                ? 'الصورة مرفقة — اكتب سؤالك أو ابعت على طول'
                : t('wb.hint')}
        </p>
      </div>
    </div>
  );
}
