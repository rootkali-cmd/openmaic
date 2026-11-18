'use client';

/**
 * Teacher HUD — the floating control cluster pinned to the upper-right of
 * the board, matching the reference layout: circular mute and pause buttons
 * beside the teacher's avatar. The follow toggle rides along as a fourth
 * control because the camera is part of the teaching experience here.
 */
import { Crosshair, Pause, Play, Volume2, VolumeX } from 'lucide-react';

import { useI18n } from '@/lib/hooks/use-i18n';
import { usePlayerStore } from '@/lib/whiteboard-engine/player';

/** Original Darsak teacher mark — a mortarboard over a speaking waveform. */
function TeacherAvatar({ speaking }: { speaking: boolean }) {
  return (
    <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#9178E6] via-[#722ED1] to-[#5B3FC7] shadow-[0_10px_26px_-12px_rgba(114,46,209,0.9)] ring-2 ring-white/15">
      <svg viewBox="0 0 48 48" className="size-11 text-white" aria-hidden>
        {/* mortarboard */}
        <path d="M24 11 8 18l16 7 16-7-16-7Z" fill="currentColor" opacity="0.95" />
        <path
          d="M15 22.5V29c0 3.2 4 5.5 9 5.5s9-2.3 9-5.5v-6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          opacity="0.75"
        />
        <path d="M40 19v7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="40" cy="28" r="2" fill="currentColor" />
        {/* speaking waveform */}
        <g className={speaking ? 'wb-wave' : 'opacity-40'}>
          <rect x="14" y="37" width="2.6" height="5" rx="1.3" fill="currentColor" />
          <rect x="19" y="35" width="2.6" height="9" rx="1.3" fill="currentColor" />
          <rect x="24" y="36.5" width="2.6" height="6" rx="1.3" fill="currentColor" />
          <rect x="29" y="34.5" width="2.6" height="10" rx="1.3" fill="currentColor" />
          <rect x="34" y="37" width="2.6" height="5" rx="1.3" fill="currentColor" />
        </g>
      </svg>
      <span
        className={`absolute top-1 right-1 size-2 rounded-full ring-2 ring-[#5B3FC7] ${
          speaking ? 'wb-live-dot bg-[#FB7E5B]' : 'bg-white/40'
        }`}
        aria-hidden
      />
    </span>
  );
}

function HudButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-9 shrink-0 place-items-center rounded-full transition disabled:opacity-30 ${
        active
          ? 'bg-white/[0.12] text-white hover:bg-white/[0.18]'
          : 'bg-white/[0.06] text-white/55 hover:bg-white/[0.1] hover:text-white/85'
      }`}
    >
      {children}
    </button>
  );
}

export function TeacherHud() {
  const { t } = useI18n();
  const status = usePlayerStore((s) => s.status);
  const muted = usePlayerStore((s) => s.muted);
  const follow = usePlayerStore((s) => s.follow);
  const toggle = usePlayerStore((s) => s.toggle);
  const setMuted = usePlayerStore((s) => s.setMuted);
  const setFollow = usePlayerStore((s) => s.setFollow);

  const speaking = status === 'playing';
  const canControl = status === 'playing' || status === 'paused';

  return (
    <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 rounded-full border border-white/10 bg-[#12141F]/90 p-1.5 shadow-[0_18px_44px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl">
      <HudButton
        label={muted ? t('wb.unmute') : t('wb.mute')}
        active={!muted}
        onClick={() => setMuted(!muted)}
      >
        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </HudButton>

      <HudButton
        label={status === 'paused' ? t('wb.resume') : t('wb.pause')}
        disabled={!canControl}
        onClick={toggle}
      >
        {status === 'paused' ? <Play className="size-4" /> : <Pause className="size-4" />}
      </HudButton>

      <HudButton
        label={follow ? t('wb.followOff') : t('wb.followOn')}
        active={follow}
        onClick={() => setFollow(!follow)}
      >
        <Crosshair className={`size-4 ${follow ? 'text-[#9178E6]' : ''}`} />
      </HudButton>

      <TeacherAvatar speaking={speaking && !muted} />
    </div>
  );
}
