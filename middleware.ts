import { NextRequest, NextResponse } from 'next/server';

import { isAgentRuntimeConfigured, isProWorkbenchEnabled } from '@/lib/config/feature-flags';
import { verifyAccessTokenEdge } from '@/lib/server/access-token-edge';
import { readDarsakProfile } from '@/lib/server/identity/host/darsak-jwt';
import { DARSAK_LOGIN_URL } from '@/lib/site-links';
import {
  anonymousOwnerForNavigation,
  type NavigationIdentity,
} from '@/lib/server/identity/navigation';

/**
 * Let the request through, carrying the anonymous owner a page request
 * establishes: the cookie is set on the page response, and the forwarded
 * request carries it too, so the page and every request it sends resolve one
 * owner (see `lib/server/identity/navigation.ts`).
 */
function next(request: NextRequest, identity: NavigationIdentity | undefined): NextResponse {
  if (!identity) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set('cookie', identity.requestCookie);
  const response = NextResponse.next({ request: { headers } });
  response.headers.append('set-cookie', identity.setCookie);
  return response;
}

/**
 * SECURITY: require a registered (signed-in) user; disable anonymous guests.
 * Opt-in via REQUIRE_REGISTERED_USER=true. When on, anonymous owner minting
 * is disabled, unauthenticated page requests redirect to Darsak sign-in,
 * unauthenticated API requests get 401, and a tiny auth-public allowlist
 * stays reachable. A request counts as registered when it has a valid Darsak
 * signed session (readDarsakProfile) OR a valid access-code cookie
 * (ACCESS_CODE + openmaic_access, verifyAccessTokenEdge). Additive and
 * reversible; existing ACCESS_CODE logic below still applies.
 */
const REQUIRE_REGISTERED_USER = /^(1|true)$/i.test(process.env.REQUIRE_REGISTERED_USER ?? '');

function isAuthPublic(pathname: string): boolean {
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico' || /\.[a-zA-Z0-9]+$/.test(pathname)) return true;
  return (
    pathname === '/login' || pathname === '/register' || pathname === '/sign-in' || pathname === '/sign-up' ||
    pathname === '/enter' || pathname.startsWith('/api/identity/') || pathname.startsWith('/api/access-code/') ||
    pathname === '/api/health' || pathname.startsWith('/api/auth/')
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // This machine-only route verifies its own signed gateway request in Node.
  if (pathname === '/api/sandbox/preview/resolve') return NextResponse.next();

  // Return an actual server-side 404 when either half of the workbench is off.
  // Edge middleware cannot reliably inspect server-only deployment variables,
  // so it enforces the public gate and leaves the complete runtime/database
  // check to Node. A Node-hosted middleware uses the same gate as startup.
  const canInspectServerRuntime = process.env.NEXT_RUNTIME !== 'edge';
  const workbenchEnabled =
    isProWorkbenchEnabled() && (!canInspectServerRuntime || isAgentRuntimeConfigured());
  if (!workbenchEnabled && (pathname === '/workbench' || pathname.startsWith('/workbench/'))) {
    return new NextResponse('Not found', { status: 404 });
  }

  // One anonymous owner per browser, established on the page response before
  // any API request can mint its own. NOT minted when a registered user is required.
  const accessCode = process.env.ACCESS_CODE;
  const identity = REQUIRE_REGISTERED_USER
    ? undefined
    : anonymousOwnerForNavigation({ method: request.method, headers: request.headers, pathname });

  // SECURITY gate (see REQUIRE_REGISTERED_USER above).
  if (REQUIRE_REGISTERED_USER && !isAuthPublic(pathname)) {
    // vercel-react-best-practices: async-parallel + async-cheap-condition-before-await
    // check cheap sync conditions first; run independent async work in parallel.
    const accessCookie = accessCode ? request.cookies.get('openmaic_access')?.value : undefined;
    const [profile, accessOk] = await Promise.all([
      readDarsakProfile(request.headers),
      accessCode && accessCookie ? verifyAccessTokenEdge(accessCookie, accessCode) : Promise.resolve(false),
    ]);
    const hasAccessCode = !!accessCode && !!accessCookie && accessOk;
    if (!profile && !hasAccessCode) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { success: false, errorCode: 'AUTHENTICATION_REQUIRED', error: 'Registration required' },
          { status: 401 },
        );
      }
      // no /login in this app; send to Darsak web sign-in, remember destination
      const loginUrl = new URL(DARSAK_LOGIN_URL);
      loginUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (!accessCode) {
    return next(request, identity);
  }

  // Whitelist: access-code endpoints, health check
  if (pathname.startsWith('/api/access-code/') || pathname === '/api/health') {
    return next(request, identity);
  }

  // Check cookie — validate HMAC signature, not just existence
  const cookie = request.cookies.get('openmaic_access');
  if (cookie?.value && (await verifyAccessTokenEdge(cookie.value, accessCode))) {
    return next(request, identity);
  }

  // API requests without valid cookie → 401
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, errorCode: 'INVALID_REQUEST', error: 'Access code required' },
      { status: 401 },
    );
  }

  // Page requests → let through, frontend shows modal
  return next(request, identity);
}

export const config = {
  // The duplex machine route authenticates its signed descriptor itself. Middleware
  // forwarding buffers POST bodies and would deadlock a bidirectional stream.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/|api/sandbox/preview/tunnel$).*)'],
};
