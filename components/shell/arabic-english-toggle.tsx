'use client';

/**
 * One-tap Arabic ⇄ English toggle.
 *
 * The full language picker lists every locale; most students only need these
 * two, and the pair should be reachable without a menu. Reads and writes the
 * shared i18n store (cookie + localStorage), so it switches the whole app.
 */
import { useI18n } from '@/lib/hooks/use-i18n';

const AR = 'ar-SA';
const EN = 'en-US';

export function ArabicEnglishToggle({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  const isArabic = locale === AR || locale.toLowerCase().startsWith('ar');

  const segment = (active: boolean, key: string) =>
    `rounded-full px-2.5 py-1 text-[11px] font-bold leading-none transition ${
      active ? 'bg-[#9178E6] text-white shadow-sm' : 'text-white/45 hover:text-white'
    } ${key}`;

  return (
    <div
      role="group"
      aria-label={isArabic ? 'اللغة' : 'Language'}
      className={`flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.05] p-0.5 ${className}`}
    >
      <button
        type="button"
        onClick={() => setLocale(AR)}
        aria-pressed={isArabic}
        lang="ar"
        className={segment(isArabic, 'ar')}
      >
        عربي
      </button>
      <button
        type="button"
        onClick={() => setLocale(EN)}
        aria-pressed={!isArabic}
        lang="en"
        className={segment(!isArabic, 'en')}
      >
        English
      </button>
    </div>
  );
}
