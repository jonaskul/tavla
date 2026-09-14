/**
 * Signing in with one-time codes, in workerd against D1.
 *
 * These are tests/test_login.py carried over property by property. The
 * mechanism is small; the care around it is the point, and each test below
 * pins one of the ways this goes wrong when written casually —
 * enumeration, flooding, guessing, replay, and sessions that outlive
 * signing out.
 *
 * A note on the guarded path used throughout. The Python versions reached
 * for /api/properties, which does not exist yet in this rewrite. It is
 * still the right probe: the guard runs before routing, so "not signed in"
 * is 401 and "signed in" is 404. Distinguishing those two is exactly the
 * question, and it will keep working unchanged once the endpoint lands.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test } from "vitest";

import { MAX_ATTEMPTS, MAX_CODES_PER_EMAIL, SESSION_COOKIE } from "../../src/auth";
import { setMailer } from "../../src/mail";
import { Client, codeFrom, outbox, signIn } from "./helpers";

const GUARDED = "/api/properties";

let client: Client;
let sent: Array<[string, string, string]>;

beforeEach(() => {
  client = new Client();
  sent = outbox();
  return () => setMailer(null);
});

// --- The happy path -------------------------------------------------------

describe("signing in", () => {
  test("creates an account and an organization", async () => {
    const res = await signIn(client, sent);
    expect((await res.json<{ email: string }>()).email).toBe("ola@example.com");

    const user = await env.DB.prepare("select id from app_user where email = ?")
      .bind("ola@example.com")
      .first<{ id: number }>();
    expect(user).not.toBeNull();

    const membership = await env.DB.prepare(
      "select organization_id from membership where user_id = ?",
    )
      .bind(user!.id)
      .first<{ organization_id: number }>();
    expect(membership, "a new user needs an organization to work in").not.toBeNull();
  });

  test("lets the caller use the app", async () => {
    expect((await client.get(GUARDED)).status).toBe(401);
    await signIn(client, sent);
    expect((await client.get(GUARDED)).status).not.toBe(401);
  });

  test("reports the user and their organizations at /me", async () => {
    await signIn(client, sent);
    const body = await (await client.get("/api/auth/me")).json<{
      email: string;
      organizations: Array<{ role: string }>;
    }>();

    expect(body.email).toBe("ola@example.com");
    expect(body.organizations).toHaveLength(1);
    expect(body.organizations[0].role).toBe("owner");
  });

  test("again reuses the account", async () => {
    await signIn(client, sent);
    await client.post("/api/auth/logout");
    await signIn(client, sent);

    const users = await env.DB.prepare(
      "select count(*) as n from app_user where email = ?",
    )
      .bind("ola@example.com")
      .first<{ n: number }>();
    expect(users!.n).toBe(1);

    const memberships = await env.DB.prepare(
      "select count(*) as n from membership",
    ).first<{ n: number }>();
    expect(memberships!.n, "a second sign-in must not add an organization").toBe(1);
  });
});

// --- Not leaking who has an account ---------------------------------------

describe("requesting a code", () => {
  test("answers the same for any address", async () => {
    await signIn(client, sent);
    await client.post("/api/auth/logout");

    const existing = await client.post("/api/auth/request-code", {
      email: "ola@example.com",
    });
    const unknown = await client.post("/api/auth/request-code", {
      email: "ingen@example.com",
    });

    expect(existing.status).toBe(unknown.status);
    expect(await existing.text()).toBe(await unknown.text());
  });

  test("answers the same when throttled as when it worked", async () => {
    const replies: Response[] = [];
    for (let i = 0; i < MAX_CODES_PER_EMAIL + 2; i++) {
      replies.push(await client.post("/api/auth/request-code", { email: "spam@example.com" }));
    }

    expect(new Set(replies.map((r) => r.status))).toEqual(new Set([200]));
    const bodies = new Set(await Promise.all(replies.map((r) => r.text())));
    expect(bodies.size).toBe(1);
    expect(sent, "throttled requests must not send mail").toHaveLength(
      MAX_CODES_PER_EMAIL,
    );
  });

  test("refuses an address that is not one", async () => {
    expect(
      (await client.post("/api/auth/request-code", { email: "ikke-en-adresse" })).status,
    ).toBe(422);
    expect((await client.post("/api/auth/request-code", {})).status).toBe(422);
  });

  test("refuses a domain that can never receive mail", async () => {
    // RFC 2606 and 6761 reserve these. scripts/smoke_test.py probes the
    // live endpoint with one precisely because validation refuses it
    // before any mail is attempted, so the check costs nothing and does
    // not spend the rate limit. Accepting them — as this did at first —
    // turns that probe into a real send, and running the smoke test twice
    // against production locks the deployer out of their own app.
    for (const email of [
      "ugyldig@ugyldig.invalid",
      "a@b.test",
      "a@b.localhost",
      "a@b.local",
      "a@-b.com",
      "a@b-.com",
    ]) {
      expect(
        (await client.post("/api/auth/request-code", { email })).status,
        email,
      ).toBe(422);
    }
    expect(sent, "nothing may be sent to an address that cannot exist").toHaveLength(0);
  });

  test("still accepts the addresses pydantic accepted", async () => {
    // Checked against pydantic's EmailStr rather than guessed. .example is
    // in the list because email-validator lets it through, however odd
    // that reads next to .test.
    for (const email of ["a@example.com", "a@b.example", "a@b.c", "æ@ø.no"]) {
      expect(
        (await client.post("/api/auth/request-code", { email })).status,
        email,
      ).toBe(200);
    }
  });
});

// --- Guessing and replay --------------------------------------------------

describe("a code", () => {
  test("is refused when wrong", async () => {
    await client.post("/api/auth/request-code", { email: "ola@example.com" });
    const res = await client.post("/api/auth/verify", {
      email: "ola@example.com",
      code: "000000",
    });

    expect(res.status).toBe(400);
    expect((await client.get(GUARDED)).status).toBe(401);
  });

  test("dies after too many wrong guesses", async () => {
    // Six digits is a million options — without a ceiling it is guessable.
    await client.post("/api/auth/request-code", { email: "ola@example.com" });
    const real = codeFrom(sent);

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await client.post("/api/auth/verify", { email: "ola@example.com", code: "000000" });
    }

    // Even the correct code no longer works.
    const res = await client.post("/api/auth/verify", {
      email: "ola@example.com",
      code: real,
    });
    expect(res.status).toBe(400);
  });

  test("works only once", async () => {
    await client.post("/api/auth/request-code", { email: "ola@example.com" });
    const code = codeFrom(sent);

    expect(
      (await client.post("/api/auth/verify", { email: "ola@example.com", code })).status,
    ).toBe(200);
    expect(
      (await client.post("/api/auth/verify", { email: "ola@example.com", code })).status,
    ).toBe(400);
  });

  test("is refused once expired", async () => {
    await client.post("/api/auth/request-code", { email: "ola@example.com" });
    const code = codeFrom(sent);

    await env.DB.prepare("update logincode set expires_at = ?")
      .bind(Date.now() - 1000)
      .run();

    expect(
      (await client.post("/api/auth/verify", { email: "ola@example.com", code })).status,
    ).toBe(400);
  });

  test("is not valid for a different address", async () => {
    await client.post("/api/auth/request-code", { email: "ola@example.com" });
    const code = codeFrom(sent);

    expect(
      (await client.post("/api/auth/verify", { email: "kari@example.com", code })).status,
    ).toBe(400);
  });

  test("is not what the database stores", async () => {
    // A database dump must not yield working codes.
    await client.post("/api/auth/request-code", { email: "ola@example.com" });
    const code = codeFrom(sent);

    const row = await env.DB.prepare("select code_hash from logincode").first<{
      code_hash: string;
    }>();

    expect(row!.code_hash).not.toContain(code);
    expect(row!.code_hash).toHaveLength(64); // HMAC-SHA256, keyed outside the database
  });
});

// --- Sessions -------------------------------------------------------------

describe("a session", () => {
  test("ends immediately on signing out", async () => {
    // The reason for server-side sessions rather than a JWT.
    await signIn(client, sent);
    expect((await client.get(GUARDED)).status).not.toBe(401);

    await client.post("/api/auth/logout");
    expect((await client.get(GUARDED)).status).toBe(401);
  });

  test("stops working when revoked, even with the cookie", async () => {
    // Revoking server-side must be enough, without the client cooperating.
    await signIn(client, sent);
    await env.DB.prepare("update usersession set revoked_at = ?").bind(Date.now()).run();

    expect((await client.get(GUARDED)).status).toBe(401);
  });

  test("stops working when expired", async () => {
    await signIn(client, sent);
    await env.DB.prepare("update usersession set expires_at = ?")
      .bind(Date.now() - 1000)
      .run();

    expect((await client.get(GUARDED)).status).toBe(401);
  });

  test("cannot be forged", async () => {
    client.setCookie(SESSION_COOKIE, "ikke-et-ekte-token");
    expect((await client.get(GUARDED)).status).toBe(401);
  });

  test("is not what the database stores", async () => {
    // A database dump must not be replayable as live sessions.
    await signIn(client, sent);
    const cookie = client.cookie(SESSION_COOKIE);

    const row = await env.DB.prepare("select token_hash from usersession").first<{
      token_hash: string;
    }>();

    expect(cookie).toBeTruthy();
    expect(row!.token_hash).not.toContain(cookie!);
  });

  test("is set with the flags that matter", async () => {
    // HttpOnly keeps XSS from lifting the session; SameSite blocks the CSRF case.
    const res = await signIn(client, sent);
    const header = res.headers.getSetCookie().join(";").toLowerCase();

    expect(header).toContain("httponly");
    expect(header).toContain("samesite=lax");
    expect(header).toContain("path=/");
  });
});

// --- Two people -----------------------------------------------------------

test("two users get separate organizations", async () => {
  // The isolation the whole tenant boundary exists for, reached by signing in.
  await signIn(client, sent, "ola@example.com");
  const ola = await (await client.get("/api/auth/me")).json<{
    organizations: Array<{ id: number }>;
  }>();
  await client.post("/api/auth/logout");

  await signIn(client, sent, "kari@example.com");
  const kari = await (await client.get("/api/auth/me")).json<{
    organizations: Array<{ id: number }>;
  }>();

  expect(kari.organizations[0].id).not.toBe(ola.organizations[0].id);
});
