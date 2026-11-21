import { SignJWT, jwtVerify, errors } from 'jose';

import type { OwnerAuthMethod, OwnerAuthMethodResult } from '@/lib/server/identity';

/**
 * Darsak AI gateway authentication (host-owned method).
 *
 * Darsak's accounts live in Clerk; the Darsak API signs HS256 assertions with
 * a shared secret (DARSAK_HOST_JWT_SECRET) and the browser hands one over at
 * `?assertion=` right after a successful sign-in. This method verifies it,
 * resolves the Darsak user to an owner (`user:<clerk user id>`) and mints a
 * long-lived session cookie (`darsak_owner`) so later requests do not need
 * the handoff. Server-to-server callers may also present the assertion as
 * `Authorization: Bearer …` or `x-darsak-assertion`.
 *
 * Verification is strict: issuer `darsak-api`, audience per token kind, HS256
 * only, short clock tolerance. A present-but-bad credential is `invalid`
 * (401), never an anonymous owner.
 */

const ISSUER = 'darsak-api';
const SESSION_AUDIENCE = 'openmaic-session';
/** Matches OPENMAIC_ASSERTION_AUDIENCE in the Darsak API env (default 'openmaic'). */
const ASSERTION_AUDIENCE = 'openmaic';
const COOKIE_NAME = 'darsak_owner';
/** Session lifetime: 30 days, renewed by the next successful sign-in. */
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

const TOKEN_ERRORS = [
  errors.JWTExpired,
  errors.JWTClaimValidationFailed,
  errors.JWTInvalid,
  errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JWKSNoMatchingKey,
  errors.JWKSMultipleMatchingKeys,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
];

interface DarsakPayload {
  sub?: string;
  aud?: string | string[];
  [key: string]: unknown;
}

/**
 * The profile the Darsak API puts on the handoff assertion (name/email from
 * its user row). It rides the session cookie so the app can greet a real
 * student without calling back to the Darsak API on every page.
 */
interface DarsakProfile {
  name?: string;
  email?: string;
}

function readProfile(payload: DarsakPayload): DarsakProfile {
  const profile: DarsakProfile = {};
  if (typeof payload.name === 'string' && payload.name.trim()) {
    profile.name = payload.name.trim().slice(0, 80);
  }
  if (typeof payload.email === 'string' && /^[^@\s]+@[^@\s]+$/.test(payload.email)) {
    profile.email = payload.email.trim().slice(0, 160);
  }
  return profile;
}

function secretKey(): Uint8Array {
  const secret = process.env.DARSAK_HOST_JWT_SECRET;
  if (!secret || secret.length < 32) {
    // Boot validation warns; here a missing secret is a hard server fault.
    throw new Error('DARSAK_HOST_JWT_SECRET is not configured (min 32 chars)');
  }
  return new TextEncoder().encode(secret);
}

function audienceMatches(payload: DarsakPayload, expected: string): boolean {
  if (typeof payload.aud === 'string') return payload.aud === expected;
  if (Array.isArray(payload.aud)) return payload.aud.includes(expected);
  return false;
}

function isHttpMethodReadonly(method?: string): boolean {
  // Requests that may change state must not resolve identity from a URL that
  // a link/redirect could have planted (GET ?assertion=). Only the browser
  // handoff itself is a GET; everything mutating must use the cookie or a
  // header credential.
  return (method ?? 'GET').toUpperCase() === 'GET';
}

/** The assertion token from `?assertion=`, `Authorization: Bearer`, or `x-darsak-assertion`. */
function assertionToken(req: { headers: Headers; method?: string; url?: string }): string | undefined {
  const auth = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization')?.trim() ?? '');
  if (auth) return auth[1];
  const header = req.headers.get('x-darsak-assertion')?.trim();
  if (header) return header;
  const url = req.url;
  if (url && isHttpMethodReadonly(req.method)) {
    const query = new URL(url, 'http://localhost').searchParams;
    const value = query.get('assertion')?.trim();
    return value || undefined;
  }
  return undefined;
}

/** The session cookie value, `undefined` when absent. */
function sessionCookieToken(req: { headers: Headers }): string | undefined {
  const cookies = req.headers.get('cookie') ?? '';
  const match = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`).exec(cookies);
  return match?.[1];
}

async function mintSessionCookie(sub: string, profile: DarsakProfile = {}): Promise<string> {
  const token = await new SignJWT({
    kind: 'darsak-owner-session',
    ...(profile.name ? { name: profile.name } : {}),
    ...(profile.email ? { email: profile.email } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setJti(`${Date.now()}-${Math.random().toString(36).slice(2, 12)}`)
    .sign(secretKey());
  const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE !== '0';
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function verifyToken(
  token: string,
  audience: string,
): Promise<{ sub: string; profile: DarsakProfile }> {
  return (async () => {
    let payload: DarsakPayload;
    try {
      const verified = await jwtVerify(token, secretKey(), {
        issuer: ISSUER,
        algorithms: ['HS256'],
        clockTolerance: 30,
        // audience checked manually below: token kinds use different audiences.
      });
      payload = verified.payload as DarsakPayload;
    } catch (error) {
      if (TOKEN_ERRORS.some((type) => error instanceof type)) {
        return { sub: '', profile: {} };
      }
      throw error;
    }
    if (!audienceMatches(payload, audience)) return { sub: '', profile: {} };
    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    if (!sub || !/^[A-Za-z0-9_:-]{1,128}$/.test(sub)) return { sub: '', profile: {} };
    return { sub, profile: readProfile(payload) };
  })();
}

export const darsakJwtMethod: OwnerAuthMethod = {
  name: 'darsakJwt',

  async authenticate(req): Promise<OwnerAuthMethodResult> {
    const key = secretKey();
    void key;

    // 1. Existing session cookie: the normal case for every later request.
    const session = sessionCookieToken(req);
    const assertion = assertionToken(req);

    if (session !== undefined) {
      const verified = await verifyToken(session, SESSION_AUDIENCE);
      if (verified.sub) {
        return {
          status: 'authenticated',
          principal: {
            ownerId: `user:${verified.sub}`,
            kind: 'user',
            roles: new Set(['course:publish']),
            assurance: 'verified',
            channel: 'darsak',
          },
          // Refresh the sliding window when the handoff comes alongside it.
          ...(assertion !== undefined
            ? { setCookies: [await mintSessionCookie(verified.sub, verified.profile)] }
            : {}),
        };
      }
      return { status: 'invalid', reason: 'bad darsak_owner session' };
    }

    // 2. The sign-in handoff assertion (query or header).
    if (assertion !== undefined) {
      const verified = await verifyToken(assertion, ASSERTION_AUDIENCE);
      if (verified.sub) {
        return {
          status: 'authenticated',
          principal: {
            ownerId: `user:${verified.sub}`,
            kind: 'user',
            roles: new Set(['course:publish']),
            assurance: 'verified',
            channel: 'darsak-handoff',
          },
          setCookies: [await mintSessionCookie(verified.sub, verified.profile)],
        };
      }
      return { status: 'invalid', reason: 'bad darsak assertion' };
    }

    // No credential of our kind anywhere: let another method (or the
    // anonymous fallback) handle it.
    return { status: 'not-applicable' };
  },

  async authenticateFromContext() {
    const { cookies } = await import('next/headers');
    const store = await cookies();
    const session = store.get(COOKIE_NAME)?.value;
    if (session === undefined) return { status: 'not-applicable' as const };
    const verified = await verifyToken(session, SESSION_AUDIENCE);
    if (!verified.sub) return { status: 'invalid' as const, reason: 'bad darsak_owner session' };
    return {
      status: 'authenticated' as const,
      principal: {
        ownerId: `user:${verified.sub}`,
        kind: 'user' as const,
        roles: new Set(['course:publish']),
        assurance: 'verified' as const,
        channel: 'darsak',
      },
    };
  },

  describeStoredOwner: (ownerId) =>
    ownerId.startsWith('user:')
      ? { kind: 'user', roles: new Set(['course:publish']) }
      : undefined,
};

/**
 * The signed-in Darsak profile carried by the session cookie, for the shell's
 * profile card (name + email). Darsak accounts live in the landing app; the
 * handoff assertion is the only thing that crosses over, and from then on it
 * stays inside this signed cookie — no call back to the Darsak API per page.
 */
export async function readDarsakProfile(
  headers: Headers,
): Promise<{ ownerId: string; kind: 'user'; name?: string; email?: string } | null> {
  const token = sessionCookieToken({ headers });
  if (token === undefined) return null;
  const verified = await verifyToken(token, SESSION_AUDIENCE);
  if (!verified.sub) return null;
  return { ownerId: `user:${verified.sub}`, kind: 'user', ...verified.profile };
}
