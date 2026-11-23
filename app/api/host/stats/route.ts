import { z } from 'zod';

import { clerkIdOf, syncStudyCounters } from '@/lib/server/host-stats';
import { withRequestOwner } from '@/lib/server/identity/with-owner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const countersSchema = z.object({
  lessons: z.number().int().min(0).max(100_000),
  quizzes: z.number().int().min(0).max(100_000),
  focusMinutes: z.number().int().min(0).max(1_000_000),
  correct: z.number().int().min(0).max(1_000_000),
  total: z.number().int().min(0).max(1_000_000),
});

/**
 * `POST /api/host/stats`: sync the signed-in student's real local counters to
 * the Darsak API so the shared leaderboard reflects genuine activity.
 * Anonymous owners are acknowledged but not synced (no account to rank).
 */
export async function POST(request: Request): Promise<Response> {
  return withRequestOwner(request, async (principal, responseHeaders) => {
    const clerkId = clerkIdOf(principal.ownerId, principal.kind);
    if (!clerkId) {
      return Response.json({ synced: false }, { headers: responseHeaders });
    }
    const parsed = countersSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { error: 'invalid counters' },
        { status: 400, headers: responseHeaders },
      );
    }
    try {
      const synced = await syncStudyCounters(clerkId, parsed.data);
      return Response.json({ synced }, { headers: responseHeaders });
    } catch {
      return Response.json({ synced: false }, { headers: responseHeaders });
    }
  });
}
