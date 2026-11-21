import { readDarsakProfile } from '@/lib/server/identity/host/darsak-jwt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * `GET /api/identity/me`: who the shell should greet.
 *
 * The Darsak sign-in handoff puts the student's name and email on the signed
 * session cookie (see `darsak-jwt.ts`), so the app can show a real profile
 * instead of a generic guest. This route only reads that cookie; it never
 * trusts a client-supplied identity. A browser that has not signed in gets
 * `signedIn: false` and the shell keeps its honest guest card.
 */
export async function GET(request: Request): Promise<Response> {
  const profile = await readDarsakProfile(request.headers);
  return Response.json(
    profile
      ? { signedIn: true, name: profile.name ?? null, email: profile.email ?? null }
      : { signedIn: false, name: null, email: null },
    { headers: { 'cache-control': 'no-store' } },
  );
}
