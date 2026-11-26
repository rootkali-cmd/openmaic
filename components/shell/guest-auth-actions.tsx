'use client';

/**
 * Sign-in affordances for the app shell.
 *
 * The Darsak product is split: the marketing landing page, sign-in and
 * sign-up live on the Darsak web app; this app is the study space and is
 * usable as a guest. Nothing in the shell used to say so, and the app's own
 * home is the chat, which made the landing/login pages feel missing. Render
 * the links, and only for guests.
 */
import { useEffect, useState } from 'react';

import { useI18n } from '@/lib/hooks/use-i18n';
import { DARSAK_LOGIN_URL, DARSAK_WEB_URL } from '@/lib/site-links';

export function GuestAuthActions() {
  const { t } = useI18n();
  const [guest, setGuest] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/identity/me', { cache: 'no-store' })
      .then((response) =>
        response.ok ? (response.json() as Promise<{ signedIn?: boolean }>) : null,
      )
      .then((data) => {
        if (!cancelled) setGuest(!data?.signedIn);
      })
      .catch(() => {
        if (!cancelled) setGuest(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (guest === null) return null;

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={DARSAK_WEB_URL}
        target="_blank"
        rel="noreferrer"
        title={t('shell.auth.landing')}
        className="hidden items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-white/45 transition hover:bg-white/[0.05] hover:text-white sm:flex"
      >
        {t('shell.auth.landing')}
      </a>
      {guest ? (
        <>
          <a
            href={DARSAK_LOGIN_URL}
            className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white/65 transition hover:bg-white/[0.06] hover:text-white"
          >
            {t('shell.auth.signIn')}
          </a>
          <a
            href={`${DARSAK_WEB_URL}/register`}
            className="rounded-lg bg-[#9178E6] px-2.5 py-1.5 text-[11px] font-bold text-white shadow-[0_6px_16px_-8px_#9178E6] transition hover:bg-[#7C63D8]"
          >
            {t('shell.auth.signUp')}
          </a>
        </>
      ) : null}
    </div>
  );
}
