import { clerkIdOf, fetchLeaderboard } from '@/lib/server/host-stats';
import { withRequestOwner } from '@/lib/server/identity/with-owner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/host/leaderboard`: the cross-user ranking from the Darsak API.
 * Signed-in students get `isMe` on their own row; guests still see the public
 * ranking (real activity only) with `signedIn: false`.
 */
export async function GET(request: Request): Promise<Response> {
  return withRequestOwner(request, async (principal, responseHeaders) => {
    const clerkId = clerkIdOf(principal.ownerId, principal.kind);
    try {
      const rows = await fetchLeaderboard(clerkId);
      return Response.json({ rows, signedIn: Boolean(clerkId) }, { headers: responseHeaders });
    } catch {
      return Response.json({ rows: [], signedIn: Boolean(clerkId) }, { headers: responseHeaders });
    }
  });
}
