import { SignJWT } from 'jose';

import { DARSAK_WEB_URL } from '@/lib/site-links';

/**
 * Server-to-server bridge for the shared leaderboard.
 *
 * OpenMAIC keeps no database; the student's real study counters live in the
 * Darsak API (Mongo). The browser's `darsak_owner` cookie proves who the
 * student is (`user:<clerk id>`); this module mints a short-lived HS256
 * assertion (aud `darsak-stats`) with the shared DARSAK_HOST_JWT_SECRET and
 * forwards the counters / reads the ranking. The secret never reaches the
 * browser.
 */

const API_BASE = (process.env.DARSAK_API_URL ?? DARSAK_WEB_URL).trim().replace(/\/+$/, '');

export interface StudyCounters {
  lessons: number;
  quizzes: number;
  focusMinutes: number;
  correct: number;
  total: number;
}

function secretKey(): Uint8Array {
  const secret = process.env.DARSAK_HOST_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('DARSAK_HOST_JWT_SECRET is not configured (min 32 chars)');
  }
  return new TextEncoder().encode(secret);
}

/** The Clerk user id behind a `user:<id>` owner, or null for guests. */
export function clerkIdOf(ownerId: string, kind: string): string | null {
  if (kind !== 'user' || !ownerId.startsWith('user:')) return null;
  const id = ownerId.slice('user:'.length);
  return /^[A-Za-z0-9_:-]{1,128}$/.test(id) ? id : null;
}

async function statsAssertion(clerkId: string): Promise<string> {
  return new SignJWT({ kind: 'darsak-stats-sync' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('darsak-api')
    .setAudience('darsak-stats')
    .setSubject(clerkId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secretKey());
}

/** Push the device's real counters; returns false for anonymous owners. */
export async function syncStudyCounters(
  clerkId: string,
  counters: StudyCounters,
): Promise<boolean> {
  const assertion = await statsAssertion(clerkId);
  const response = await fetch(`${API_BASE}/v1/stats`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${assertion}` },
    body: JSON.stringify(counters),
    cache: 'no-store',
  });
  return response.ok;
}

/** Remove the student's synced counters (ranking opt-out); false on failure. */
export async function removeStudyStats(clerkId: string): Promise<boolean> {
  const assertion = await statsAssertion(clerkId);
  const response = await fetch(`${API_BASE}/v1/stats/me`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${assertion}` },
    cache: 'no-store',
  });
  return response.ok;
}

export interface LeaderboardRow {
  rank: number;
  name: string;
  universityNameAr: string | null;
  major: string | null;
  lessons: number;
  quizzes: number;
  focusMinutes: number;
  average: number | null;
  isMe: boolean;
}

/** Read the cross-user ranking; `isMe` is set when a clerk id is supplied. */
export async function fetchLeaderboard(clerkId: string | null): Promise<LeaderboardRow[]> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (clerkId) headers.authorization = `Bearer ${await statsAssertion(clerkId)}`;
  const response = await fetch(`${API_BASE}/v1/leaderboard`, { headers, cache: 'no-store' });
  if (!response.ok) return [];
  const data = (await response.json()) as { rows?: LeaderboardRow[] };
  return Array.isArray(data.rows) ? data.rows : [];
}
