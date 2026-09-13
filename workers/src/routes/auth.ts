/**
 * Passwordless sign-in with one-time codes.
 *
 * A six-digit code rather than a magic link on purpose: mail apps often
 * open links in an embedded browser that does not share the session, so
 * the user ends up signed in somewhere they cannot see. A code lets them
 * stay in the tab they started in, and works when mail is read on a
 * different device.
 *
 * The mechanism is small. What it costs is the care around it:
 *
 * - Requesting a code always answers the same way, so the endpoint cannot
 *   be used to discover which addresses have accounts.
 * - Codes are rate limited per address and per IP: without that this is
 *   both an email-flooding tool and a way to grind the code space.
 * - A code is single use, short lived, and dies after a few wrong guesses.
 * - Comparison is constant time, against an HMAC rather than a bare hash.
 * - Signing in issues a server-side session, so signing out is immediate.
 *
 * Note what this file does not contain: a database handle. Everything that
 * touches a table lives in src/auth.ts, which is the one module allowed to
 * work unscoped, and tests/architecture.test.ts keeps it that way.
 */

import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";

import * as auth from "../auth";
import { type Bindings, cookieSettings } from "../config";
import { fail, jsonBody, requireEmail, requireString } from "../http";
import { mailerFor } from "../mail";

/** Same answer whether or not the address has an account. */
const NEUTRAL_REPLY = {
  ok: true,
  detail: "Hvis adressen er gyldig, er en kode sendt.",
};

export const authRoutes = new Hono<{ Bindings: Bindings }>();

authRoutes.post("/request-code", async (c) => {
  const body = await jsonBody(c.req.raw);
  const email = auth.normaliseEmail(requireEmail(body, "email"));
  const ip = auth.clientIp(c.req.raw);

  if (await auth.tooManyRequests(c.env, email, ip)) {
    // The address is logged because the usual cause of unexpected
    // throttling is everyone sharing one apparent IP. Seeing the same one
    // on every throttle is the tell.
    console.info(`Ratebegrenset kodeforespørsel for ${email} fra ${ip}`);
    return c.json(NEUTRAL_REPLY);
  }

  const code = await auth.issueCode(c.env, email, ip);
  const minutes = Math.floor(auth.CODE_TTL_MS / 60_000);

  try {
    await mailerFor(c.env)(
      email,
      "Innloggingskode til Tavla",
      `Koden din er ${code}\n\n` +
        `Den er gyldig i ${minutes} minutter.\n` +
        "Har du ikke bedt om den, kan du se bort fra denne e-posten.",
    );
  } catch (error) {
    // The code is already stored, so a delivery failure is logged rather
    // than reported: the reply must not vary with the address.
    console.error("Klarte ikke sende innloggingskode:", error);
  }

  return c.json(NEUTRAL_REPLY);
});

authRoutes.post("/verify", async (c) => {
  const body = await jsonBody(c.req.raw);
  const email = auth.normaliseEmail(requireEmail(body, "email"));
  const code = requireString(body, "code");

  // One message for every way this can fail — expired, spent, wrong, never
  // issued, or issued to a different address. Telling them apart would say
  // whether an address has an outstanding code.
  if (!(await auth.consumeCode(c.env, email, code))) {
    throw fail(400, "Ugyldig eller utløpt kode");
  }

  const user = await auth.provision(c.env, email);
  const token = await auth.startSession(
    c.env,
    user.id,
    c.req.header("user-agent") ?? null,
  );

  const cookie = cookieSettings(c.env);
  setCookie(c, auth.SESSION_COOKIE, token, {
    maxAge: Math.floor(auth.SESSION_TTL_MS / 1000),
    httpOnly: true, // unreadable from JavaScript, so XSS cannot lift it
    secure: cookie.secure,
    // "Lax" blocks cross-site POST, which is the CSRF case here. It holds
    // because the app and the API are served under one registrable domain
    // — browsers decide "same site" by that, not by hostname.
    sameSite: cookie.sameSite,
    domain: cookie.domain,
    path: "/",
  });

  return c.json({ id: user.id, email: user.email, name: user.name });
});

authRoutes.post("/logout", async (c) => {
  const token = auth.cookieValue(c.req.raw, auth.SESSION_COOKIE);
  if (token) await auth.revokeSession(c.env, token);

  const cookie = cookieSettings(c.env);
  deleteCookie(c, auth.SESSION_COOKIE, { path: "/", domain: cookie.domain });

  // Always 200, with or without a session, so a client can call this
  // without checking first.
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const principal = await auth.principalFor(c.env, c.req.raw);
  if (!principal) throw fail(401, "Ikke innlogget");

  return c.json({
    id: principal.userId,
    email: principal.email,
    organizations: await auth.organizationsFor(c.env, principal.userId),
  });
});
