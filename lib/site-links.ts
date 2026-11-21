/**
 * Links that leave the app for the Darsak landing site (pricing, account).
 * The base is a public env so each deployment can point at its own landing
 * host without a code change; the current Heroku landing is the fallback.
 */
const base = (process.env.NEXT_PUBLIC_DARSAK_WEB_URL ?? 'https://darsak-ai-0dad2515c6f0.herokuapp.com')
  .trim()
  .replace(/\/+$/, '');

export const DARSAK_WEB_URL = base;
export const DARSAK_PRICING_URL = `${base}/pricing`;
export const DARSAK_LOGIN_URL = `${base}/login`;
