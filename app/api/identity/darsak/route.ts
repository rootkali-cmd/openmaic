import { withRequestOwner } from '@/lib/server/identity/with-owner';
import { DARSAK_LOGIN_URL } from '@/lib/site-links';

export const runtime = 'nodejs';

/**
 * `GET /api/identity/darsak?assertion=…`: the Darsak sign-in handoff.
 *
 * Darsak's web app redirects the freshly signed-in browser here with a
 * short-lived HS256 assertion (signed by the Darsak API with the shared
 * DARSAK_HOST_JWT_SECRET). Owner resolution runs the `darsakJwt` host method
 * (`lib/server/identity/host/darsak-jwt.ts`), which verifies it, resolves the
 * Darsak user to `user:<clerk id>` and mints the 30-day `darsak_owner`
 * session cookie — its `Set-Cookie` values ride `responseHeaders`, so they
 * attach to the redirect below.
 *
 * This must be a route handler, not a page: page navigations are resolved by
 * the middleware, which cannot see host-registered methods, so an assertion
 * handed to `/` directly would be ignored. After the redirect the token is
 * also gone from the URL.
 *
 * An anonymous principal here means the assertion was absent or refused:
 * with the anonymous fallback on, the visitor still lands in the app, but as
 * an anonymous owner (and Darsak's next sign-in attempt can try again).
 */
export async function GET(request: Request): Promise<Response> {
  return withRequestOwner(request, async (principal, responseHeaders) => {
    // A relative Location: behind Heroku's router `request.url` carries the
    // internal host/port, not the public one.
    if (principal.kind === 'anonymous') {
      // With registration required, `/?darsak-auth=failed` would only bounce
      // through the gate back to sign-in; send the student there directly.
      if (/^(1|true)$/i.test(process.env.REQUIRE_REGISTERED_USER ?? '')) {
        const loginUrl = new URL(DARSAK_LOGIN_URL);
        loginUrl.searchParams.set('next', '/');
        loginUrl.searchParams.set('reason', 'handoff');
        responseHeaders.set('location', loginUrl.toString());
      } else {
        responseHeaders.set('location', '/?darsak-auth=failed');
      }
    } else {
      responseHeaders.set('location', '/');
    }
    return new Response(null, { status: 302, headers: responseHeaders });
  });
}
