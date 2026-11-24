import type { Metadata, Viewport } from 'next';
import { Tajawal } from 'next/font/google';
import { AdaptiveProvider } from '@/lib/adaptive/adaptive-provider';
import { identifyRequestDevice } from '@/lib/adaptive/request-device';
import { cookies, headers } from 'next/headers';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import '@fontsource-variable/cairo';
import './globals.css';
import '@openmaic/renderer/fonts.css';
import 'animate.css';
import 'katex/dist/katex.min.css';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { I18nProvider } from '@/lib/hooks/use-i18n';
import { Toaster } from '@/components/ui/sonner';
import { AgentRegistryInit } from '@/components/agent-registry-init';
import { ModelSettingsInit } from '@/components/model-settings-init';
import { StorageHealthNotice } from '@/components/storage-health-notice';
import { StatsSyncInit } from '@/components/stats-sync-init';
import { AccessCodeGuard } from '@/components/access-code-guard';
import { ProSwapWatcher } from '@/components/workbench/ProSwapWatcher';
import { loadLocaleResource } from '@/lib/i18n/load-resource';
import { LOCALE_COOKIE, resolveRequestLocale } from '@/lib/i18n/resolve-locale';
import { isRtlLocale } from '@/lib/i18n/types';

// The UI font is loaded from @fontsource's stylesheet rather than next/font,
// because only the stylesheet carries the per-subset `unicode-range`
// declarations. Pointing next/font at `inter-latin-wght-normal.woff2` loaded
// exactly one subset, so every character outside Latin — Cyrillic for ru-RU,
// tone-marked letters for vi-VN — fell back to an arbitrary OS font and
// rendered in a different typeface mid-word.
//
// Declaring the other subset files as sibling faces of the same family does not
// fix it either: faces with identical descriptors and no `unicode-range` do not
// fall through per glyph, so the browser simply picks one.
//
// `--font-sans` moves to globals.css since the family no longer comes from
// next/font's generated class.
import '@fontsource-variable/inter';

/**
 * Display face for headings — the same Tajawal the Darsak landing site uses,
 * so section titles keep one identity across both apps. Body copy stays on
 * Cairo (see `--font-arabic` in globals.css), which is the site's body face.
 */
const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-tajawal',
  display: 'swap',
});

/**
 * Applies the dark theme before the first paint. `ThemeProvider` resolves the
 * theme (the `theme` key in localStorage, else the system preference) only
 * once the page's scripts run, so a server-rendered page would otherwise be
 * painted light and flip to dark afterwards. Keep in step with
 * `lib/hooks/use-theme.tsx`.
 */
const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

// Keep the browser's default cutout avoidance: full-screen routes such as
// classroom do not yet pad their controls for edge-to-edge rendering.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: 'Darsak AI · دارس',
    template: '%s · Darsak AI',
  },
  description: 'دارس: مدرّس ذكي يشرح على السبورة خطوة بخطوة، ويجاوب أسئلتك بالعربي في نفس الصفحة.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The client hydrates with this same locale and bundle instead of detecting
  // its own, so the first render matches the server's HTML.
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const locale = resolveRequestLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerStore.get('accept-language'),
  });
  const resources = await loadLocaleResource(locale);
  const { initialMobileLayout } = identifyRequestDevice(headerStore.get('user-agent'));

  return (
    <html lang={locale} dir={isRtlLocale(locale) ? 'rtl' : 'ltr'} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} ${tajawal.variable} antialiased`}
        suppressHydrationWarning
      >
        <AdaptiveProvider initialMobileLayout={initialMobileLayout}>
          <ThemeProvider>
            <I18nProvider initialLocale={locale} initialResources={resources}>
              <ModelSettingsInit />
              <AgentRegistryInit />
              <ProSwapWatcher />
              <StatsSyncInit />
              <AccessCodeGuard>{children}</AccessCodeGuard>
              <Toaster position="top-center" />
              {/* After the Toaster: this one raises a toast on mount when
                persistence is already broken, and a toast raised before its
                host exists has nowhere to go. */}
              <StorageHealthNotice />
            </I18nProvider>
          </ThemeProvider>
        </AdaptiveProvider>
      </body>
    </html>
  );
}
