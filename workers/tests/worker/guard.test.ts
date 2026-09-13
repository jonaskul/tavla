/**
 * The guard in front of everything.
 *
 * These matter more than they look. Sessions 5 to 7 add roughly 56
 * endpoints, and none of them will say anything about authentication —
 * they are protected because the guard runs before routing, not because
 * each remembered to ask. So what is actually being tested here is every
 * endpoint that does not exist yet.
 *
 * The Python version reached the same conclusion the expensive way: a
 * per-endpoint dependency was forgotten on all seventeen create endpoints,
 * which meant an unauthenticated POST reached the database and answered
 * 500 instead of 401.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test } from "vitest";

import { ORG_HEADER } from "../../src/auth";
import { setMailer } from "../../src/mail";
import { Client, outbox, signIn } from "./helpers";

let client: Client;
let sent: Array<[string, string, string]>;

beforeEach(() => {
  client = new Client();
  sent = outbox();
  return () => setMailer(null);
});

describe("without a session", () => {
  test("a route that does not exist yet is still refused", async () => {
    // 401 rather than 404: the guard answers before routing does, so an
    // anonymous caller cannot map which endpoints exist.
    for (const path of ["/api/properties", "/api/panels/1", "/api/noe-nytt"]) {
      const res = await client.get(path);
      expect(res.status, path).toBe(401);
      expect(await res.json()).toEqual({ detail: "Ikke innlogget" });
    }
  });

  test("a write is refused too", async () => {
    const res = await client.post("/api/properties", { name: "Mitt", address: "A" });
    expect(res.status).toBe(401);

    const rows = await env.DB.prepare("select count(*) as n from property").first<{
      n: number;
    }>();
    expect(rows!.n, "nothing may be written on the way to a 401").toBe(0);
  });

  test("the public surface stays reachable", async () => {
    expect((await client.get("/api/health")).status).toBe(200);
    expect((await client.post("/api/auth/logout")).status).toBe(200);
    expect((await client.get("/api/auth/me")).status).toBe(401);
    expect(
      (await client.post("/api/auth/request-code", { email: "a@example.com" })).status,
    ).toBe(200);
  });
});

describe("with a session", () => {
  test("the caller gets past the guard", async () => {
    await signIn(client, sent);
    const res = await client.get("/api/noe-nytt");

    // 404 from the router, not 401 from the guard. The distinction is the
    // whole point: the guard let this through.
    expect(res.status).toBe(404);
  });

  test("asking to act as someone else's organization is refused", async () => {
    await signIn(client, sent, "ola@example.com");
    const other = await env.DB.prepare(
      "insert into organization (name) values ('Fremmed') returning id",
    ).first<{ id: number }>();

    const res = await client.fetch("/api/noe-nytt", {
      headers: { [ORG_HEADER]: String(other!.id) },
    });

    // Not a distinct error. "Not a membership" and "not signed in" are one
    // answer, or the header becomes a way to probe which ids exist.
    expect(res.status).toBe(401);
  });

  test("acting as one's own organization is allowed explicitly", async () => {
    await signIn(client, sent);
    const mine = await (await client.get("/api/auth/me")).json<{
      organizations: Array<{ id: number }>;
    }>();

    const res = await client.fetch("/api/noe-nytt", {
      headers: { [ORG_HEADER]: String(mine.organizations[0].id) },
    });
    expect(res.status).toBe(404);
  });

  test("a nonsense organization header is refused, not ignored", async () => {
    await signIn(client, sent);
    for (const value of ["", "abc", "1.5", "-1", "999999"]) {
      const res = await client.fetch("/api/noe-nytt", {
        headers: { [ORG_HEADER]: value },
      });
      expect(res.status, value).toBe(401);
    }
  });

  test("a user with no organization sees nothing", async () => {
    // Reachable if provisioning half-failed, or once someone is removed
    // from the last organization they belonged to. Being signed in is not
    // by itself permission to see anything.
    await signIn(client, sent);
    await env.DB.prepare("delete from membership").run();

    expect((await client.get("/api/noe-nytt")).status).toBe(401);
  });
});
