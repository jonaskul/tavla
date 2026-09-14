/**
 * The settings, and which direction they fail in.
 *
 * wrangler.toml now describes production, and .dev.vars is what makes a
 * local run a local run. That puts real weight on these: a forgotten
 * override has to give the stricter behaviour, not the slacker one.
 *
 * The session secret is the one that matters most, and for a reason
 * specific to Workers. config.py falls back to a random key when none is
 * set, which in a long-lived process merely invalidates sessions on
 * restart. Here isolates are created and discarded constantly, so a random
 * key would mean a one-time code issued by one isolate cannot be verified
 * by the next — sign-in failing at random, looking like a bug in the code
 * rather than a missing secret.
 */

import { describe, expect, test } from "vitest";

import {
  ConfigError,
  cookieSettings,
  isProduction,
  secretFor,
  type Bindings,
} from "../src/config";

/** Only the fields under test; the bindings themselves are irrelevant here. */
const env = (vars: Partial<Bindings> = {}) => vars as Bindings;

describe("production", () => {
  test("refuses to invent a session secret", () => {
    expect(() => secretFor(env({ TAVLA_ENV: "production" }))).toThrow(ConfigError);
  });

  test("uses the one it is given", () => {
    const secret = secretFor(env({ TAVLA_ENV: "production", SESSION_SECRET: "hemmelig" }));
    expect(new TextDecoder().decode(secret)).toBe("hemmelig");
  });

  test("is what an unset environment is not", () => {
    // The default is development, which is why the committed config names
    // production explicitly rather than relying on a default.
    expect(isProduction(env())).toBe(false);
    expect(isProduction(env({ TAVLA_ENV: "production" }))).toBe(true);
    expect(isProduction(env({ TAVLA_ENV: "PRODUCTION" }))).toBe(true);
  });
});

describe("development", () => {
  test("uses a fixed secret rather than a random one", () => {
    // Fixed on purpose: a random one per isolate makes sign-in fail
    // intermittently and look like a bug in the code.
    const a = secretFor(env());
    const b = secretFor(env());
    expect(new TextDecoder().decode(a)).toBe(new TextDecoder().decode(b));
  });

  test("still prefers a real secret when one is set", () => {
    expect(new TextDecoder().decode(secretFor(env({ SESSION_SECRET: "min" })))).toBe("min");
  });
});

describe("the session cookie", () => {
  test("is Secure and Lax unless something says otherwise", () => {
    expect(cookieSettings(env())).toEqual({
      secure: true,
      sameSite: "Lax",
      domain: undefined,
    });
  });

  test("is host-only when no domain is named", () => {
    // wrangler.toml deliberately leaves COOKIE_DOMAIN unset. Without it
    // the browser sends the cookie only to the exact host, and not to
    // anything else under digibygg.io — including future subdomains that
    // are not Tavla.
    expect(cookieSettings(env({ TAVLA_ENV: "production" })).domain).toBeUndefined();
  });

  test("only an explicit 0 turns Secure off, so a typo fails safe", () => {
    expect(cookieSettings(env({ COOKIE_SECURE: "0" })).secure).toBe(false);
    for (const value of ["", "false", "no", "1", "yes"]) {
      expect(cookieSettings(env({ COOKIE_SECURE: value })).secure, value).toBe(true);
    }
  });

  test("refuses SameSite=None without Secure", () => {
    // Browsers drop that combination outright, which would leave the
    // session cookie silently missing rather than merely weakened.
    expect(() =>
      cookieSettings(env({ COOKIE_SAMESITE: "none", COOKIE_SECURE: "0" })),
    ).toThrow(ConfigError);

    expect(cookieSettings(env({ COOKIE_SAMESITE: "none" })).sameSite).toBe("None");
  });
});

describe("what ships", () => {
  test("wrangler.toml names production and leaves the cookie host-only", async () => {
    // The point of this file is that the committed config is the strict
    // one. Worth checking that it still says so.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const toml = fs.readFileSync(
      path.join(import.meta.dirname, "..", "wrangler.toml"),
      "utf8",
    );

    expect(toml).toMatch(/^TAVLA_ENV = "production"$/m);
    expect(toml).toMatch(/^AUTH_FROM_EMAIL = /m);
    expect(toml, "COOKIE_DOMAIN skal ikke settes").not.toMatch(/^COOKIE_DOMAIN = /m);
    expect(toml, "hemmeligheter hører ikke hjemme i config").not.toMatch(
      /^SESSION_SECRET = |^RESEND_API_KEY = /m,
    );
  });
});
