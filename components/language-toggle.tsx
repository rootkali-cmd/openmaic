'use client';

/**
 * Explicit Arabic/English toggle.
 *
 * The app already has a full `LanguageSwitcher` dropdown (twelve locales);
 * this is the two-line, always-visible control for the product's two main
 * languages. It flips `dir` too because `setLocale` re-renders with RTL for
 * Arabic (see `isRtlLocale` in the i18n provider).
 */
import { useI18n } from '@/lib/hooks/use-i18n';
import type { Locale } from '@/lib/i18n';

export function LanguageToggle({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  const isArabic = locale.toLowerCase().startsWith('ar');

  const options: Array<{ code: Locale; label: string }> = [
    { code: 'ar-SA', label: 'عربي' },
    { code: 'en-US', label: 'English' },
  ];

  return (
    <div
      className={`inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] p-0.5 ${className}`}
      role="group"
      aria-label="لغة الواجهة / Interface language"
    >
      {options.map((option) => {
        const active = option.code === 'ar-SA' ? isArabic : !isArabic;
        return (
          <button
            key={option.code}
            type="button"
            onClick={() => setLocale(option.code)}
            aria-pressed={active}
            className={`rounded-full px-2 py-1 text-[10.5px] font-semibold transition sm:px-2.5 sm:text-[11px] ${
              active
                ? 'bg-[#9178E6] text-white'
                : 'text-white/50 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
