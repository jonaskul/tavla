/**
 * Who is calling, and which organization they are acting as.
 *
 * This is the one module outside src/db that holds an unscoped database
 * handle, and tests/architecture.test.ts is what keeps that list short.
 * The reason is unavoidable rather than convenient: every question here is
 * asked *before* a tenant is known, so scoping it through Tenant would be
 * circular.
 *
 * The consequence is that route handlers never get a handle of their own.
 * routes/auth.ts calls the functions below and touches no table directly,
 * which is why it does not appear in that allowlist either.
 *
 * Two properties are worth stating up front, because the rest of the file
 * is arranged around them:
 *
 * - Every rejection returns null rather than throwing. An expired, revoked
 *   or forged cookie is indistinguishable from not being signed in, and
 *   both mean "sees nothing".
 * - Nothing here is created as a side effect of an unauthenticated
 *   request, except by `provision`, which runs only after a correct code
 *   has been verified.
 */

import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";

import * as s from "./schema";
import { connect, unscoped } from "./db";
import { type Bindings, secretFor } from "./config";
import { constantTimeEqual, hmacHex, sessionToken, sha256Hex, sixDigitCode } from "./crypto";

export const SESSION_COOKIE = "tavla_session";
export const ORG_HEADER = "X-Organization-Id";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_ATTEMPTS = 5;

// A fresh code per request would let anyone fill an inbox; these caps are
// what stops that as well as grinding the code space.
export const MAX_CODES_PER_EMAIL = 3;
export const EMAIL_WINDOW_MS = 15 * 60 * 1000;
export const MAX_CODES_PER_IP = 10;
export const IP_WINDOW_MS = 60 * 60 * 1000;

/** How stale a session's last_seen_at may get before it is worth a write. */
const LAST_SEEN_INTERVAL_MS = 60 * 60 * 1000;

export interface Principal {
  userId: number;
  email: string;
  externalAuthId: string | null;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The caller's address, as Cloudflare saw it.
 *
 * CF-Connecting-IP is set by the edge and cannot be spoofed by the client;
 * X-Forwarded-For can, so it is deliberately not consulted. This quietly
 * removes the trap documented in deploy/nginx.conf, where an untrusted
 * forwarded header made every caller share one address and the per-IP cap
 * locked out everybody.
 */
export function clientIp(request: Request): string | null {
  return request.headers.get("CF-Connecting-IP");
}

async function codeHash(env: Bindings, email: string, code: string): Promise<string> {
  return hmacHex(secretFor(env), `${email}:${code}`);
}

// --- Requesting a code ----------------------------------------------------

/** Whether this address or address-holder has asked too often lately. */
export async function tooManyRequests(
  env: Bindings,
  email: string,
  ip: string | null,
): Promise<boolean> {
  const db = unscoped(connect(env));
  const now = Date.now();

  const forEmail = await db
    .select({ n: sql<number>`count(*)` })
    .from(s.loginCode)
    .where(
      and(
        eq(s.loginCode.email, email),
        gt(s.loginCode.createdAt, new Date(now - EMAIL_WINDOW_MS)),
      ),
    )
    .get();
  if (Number(forEmail?.n ?? 0) >= MAX_CODES_PER_EMAIL) return true;

  if (ip) {
    const forIp = await db
      .select({ n: sql<number>`count(*)` })
      .from(s.loginCode)
      .where(
        and(
          eq(s.loginCode.requestedIp, ip),
          gt(s.loginCode.createdAt, new Date(now - IP_WINDOW_MS)),
        ),
      )
      .get();
    if (Number(forIp?.n ?? 0) >= MAX_CODES_PER_IP) return true;
  }

  return false;
}

/** Store a new code and return the plaintext, which only the mail may see. */
export async function issueCode(
  env: Bindings,
  email: string,
  ip: string | null,
): Promise<string> {
  const code = sixDigitCode();
  await unscoped(connect(env))
    .insert(s.loginCode)
    .values({
      email,
      codeHash: await codeHash(env, email, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      requestedIp: ip,
    });
  return code;
}

// --- Verifying a code -----------------------------------------------------

/**
 * Check a code and spend it. True only if it was correct and unused.
 *
 * Only the newest outstanding code for the address is considered, so
 * asking for a second one puts the first out of reach — the same
 * behaviour as the Python version, and what makes "resend" mean resend
 * rather than "now two codes work".
 */
export async function consumeCode(
  env: Bindings,
  email: string,
  code: string,
): Promise<boolean> {
  const db = unscoped(connect(env));
  const now = new Date();

  const candidate = await db
    .select()
    .from(s.loginCode)
    .where(and(eq(s.loginCode.email, email), isNull(s.loginCode.usedAt)))
    // created_at has second resolution, so two codes requested in the same
    // second would tie; id breaks it in the same direction.
    .orderBy(desc(s.loginCode.createdAt), desc(s.loginCode.id))
    .get();

  if (!candidate || candidate.expiresAt < now) return false;

  if (candidate.attempts >= MAX_ATTEMPTS) {
    // Burn it rather than leaving something guessable lying around.
    await db.update(s.loginCode).set({ usedAt: now }).where(eq(s.loginCode.id, candidate.id));
    return false;
  }

  if (!constantTimeEqual(candidate.codeHash, await codeHash(env, email, code))) {
    await db
      .update(s.loginCode)
      .set({ attempts: candidate.attempts + 1 })
      .where(eq(s.loginCode.id, candidate.id));
    return false;
  }

  await db.update(s.loginCode).set({ usedAt: now }).where(eq(s.loginCode.id, candidate.id));
  return true;
}

// --- Accounts -------------------------------------------------------------

/**
 * Find or create the user, and give a new one their own organization.
 *
 * With passwordless login, signing in the first time is signing up; there
 * is no separate registration step to hang this off. Called only after a
 * code has been verified, so an unauthenticated request cannot make rows.
 */
export async function provision(env: Bindings, email: string) {
  const db = unscoped(connect(env));

  let user = await db.select().from(s.appUser).where(eq(s.appUser.email, email)).get();
  if (!user) {
    [user] = await db.insert(s.appUser).values({ email }).returning();
  }

  const existing = await db
    .select()
    .from(s.membership)
    .where(eq(s.membership.userId, user.id))
    .get();

  if (!existing) {
    const [org] = await db.insert(s.organization).values({ name: email }).returning();
    await db
      .insert(s.membership)
      .values({ userId: user.id, organizationId: org.id, role: "owner" });
  }

  return user;
}

/** The organizations this person belongs to, oldest membership first. */
export async function organizationsFor(env: Bindings, userId: number) {
  return unscoped(connect(env))
    .select({
      id: s.organization.id,
      name: s.organization.name,
      role: s.membership.role,
    })
    .from(s.membership)
    .innerJoin(s.organization, eq(s.organization.id, s.membership.organizationId))
    .where(eq(s.membership.userId, userId))
    .orderBy(s.membership.id)
    .all();
}

/**
 * Which of the caller's organizations this request acts as.
 *
 * A person can belong to several — an electrician documenting customers'
 * installations who also documents their own house. The header names which
 * one; with a single membership it can be left out.
 *
 * Every path that is not a confirmed membership returns null, and null
 * means the request sees nothing. An unknown header value is therefore not
 * an error to route around but simply not a membership.
 */
export async function resolveOrganization(
  env: Bindings,
  principal: Principal | null,
  request: Request,
): Promise<number | null> {
  if (!principal) return null;

  const memberships = await unscoped(connect(env))
    .select({ organizationId: s.membership.organizationId })
    .from(s.membership)
    .where(eq(s.membership.userId, principal.userId))
    .orderBy(s.membership.id)
    .all();
  if (memberships.length === 0) return null;

  const requested = request.headers.get(ORG_HEADER);
  if (requested !== null) {
    const wanted = Number(requested);
    if (!Number.isInteger(wanted)) return null;
    return memberships.some((m) => m.organizationId === wanted) ? wanted : null;
  }

  // No header: the oldest membership, which is the only one for everybody
  // who belongs to a single organization.
  return memberships[0].organizationId;
}

// --- Sessions -------------------------------------------------------------

export async function startSession(
  env: Bindings,
  userId: number,
  userAgent: string | null,
): Promise<string> {
  const token = sessionToken();
  await unscoped(connect(env))
    .insert(s.userSession)
    .values({
      userId,
      tokenHash: await sha256Hex(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      userAgent,
    });
  return token;
}

/** Revoke by token. Silent when there is nothing to revoke. */
export async function revokeSession(env: Bindings, token: string): Promise<void> {
  await unscoped(connect(env))
    .update(s.userSession)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(s.userSession.tokenHash, await sha256Hex(token)),
        isNull(s.userSession.revokedAt),
      ),
    );
}

/** The person behind this request, or null if nobody is signed in. */
export async function principalFor(
  env: Bindings,
  request: Request,
): Promise<Principal | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;

  const db = unscoped(connect(env));
  const now = new Date();

  const row = await db
    .select()
    .from(s.userSession)
    .where(eq(s.userSession.tokenHash, await sha256Hex(token)))
    .get();
  if (!row || row.revokedAt !== null || row.expiresAt < now) return null;

  const user = await db.select().from(s.appUser).where(eq(s.appUser.id, row.userId)).get();
  if (!user) return null;

  // Cheap liveness signal, useful for showing someone their active
  // sessions later. Throttled so a busy client is not a write per request.
  if (now.getTime() - row.lastSeenAt.getTime() > LAST_SEEN_INTERVAL_MS) {
    await db
      .update(s.userSession)
      .set({ lastSeenAt: now })
      .where(eq(s.userSession.id, row.id));
  }

  return {
    userId: user.id,
    email: user.email,
    externalAuthId: user.externalAuthId,
  };
}

/**
 * Read one cookie off the request.
 *
 * Hand-rolled rather than pulled from hono/cookie so this module stays
 * usable outside a request handler — and because the parsing is four
 * lines and the failure mode of getting it wrong is silent.
 */
export function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}
