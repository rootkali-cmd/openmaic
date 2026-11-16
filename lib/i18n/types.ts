import { supportedLocales } from './locales';

export type Locale = (typeof supportedLocales)[number]['code'];

/** Darsak AI is an Arabic-first platform: the default locale is Arabic. */
export const defaultLocale: Locale = 'ar-SA';

/** Locales rendered right-to-left. */
const RTL_LOCALES = new Set(['ar-SA']);

export function isRtlLocale(locale: string): boolean {
  return RTL_LOCALES.has(locale);
}

/** A supported locale code exactly as given, or undefined for anything else. */
export function supportedLocaleOf(value: unknown): Locale | undefined {
  return typeof value === 'string' && supportedLocales.some((locale) => locale.code === value)
    ? (value as Locale)
    : undefined;
}
