/**
 * The cryptography sign-in rests on.
 *
 * Two of these are known-answer tests against values computed by Python's
 * `hmac` and `hashlib`. That is the point: the whole rewrite is an attempt
 * to reproduce a working implementation, and "the digest is 64 characters
 * of hex" would pass for an implementation that keyed the HMAC wrongly.
 * Pinning the actual bytes means a mistake shows up here rather than as
 * codes that never verify.
 *
 * The rest check the properties that are easy to write subtly wrong and
 * impossible to notice: uniformity, and not leaking through timing.
 */

import { describe, expect, test } from "vitest";

import {
  constantTimeEqual,
  hmacHex,
  sessionToken,
  sha256Hex,
  sixDigitCode,
} from "../src/crypto";

const secret = new TextEncoder().encode("test-hemmelighet");

describe("HMAC", () => {
  test("agrees with Python's hmac, byte for byte", async () => {
    expect(await hmacHex(secret, "ola@example.com:123456")).toBe(
      "65ed5a1e9428f51197564e179e31a02499a2d63905c2d4083bf3e8ccd4e11209",
    );
  });

  test("changes completely with the key", async () => {
    const other = new TextEncoder().encode("en-annen-hemmelighet");
    expect(await hmacHex(other, "ola@example.com:123456")).not.toBe(
      await hmacHex(secret, "ola@example.com:123456"),
    );
  });

  test("binds the code to the address", async () => {
    // The separator is what stops "ola@example.com" + "1:123456" from
    // hashing the same as "ola@example.com:1" + "23456".
    expect(await hmacHex(secret, "ola@example.com:123456")).not.toBe(
      await hmacHex(secret, "kari@example.com:123456"),
    );
  });
});

test("SHA-256 agrees with Python's hashlib", async () => {
  expect(await sha256Hex("et-token")).toBe(
    "e604ccf73e2410f180ef5b4de25b79019e837808222a2b32f05cfb6062277c7b",
  );
});

describe("constant-time comparison", () => {
  test("still answers the question correctly", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });

  // There is deliberately no test that the comparison is constant time.
  // A timing test at this resolution is noise, and a test that reads the
  // source for an early return passes the day someone writes the same bug
  // differently. The property lives in the implementation and its comment;
  // what is checkable here is that it still answers correctly.
});

describe("the six-digit code", () => {
  test("is always six digits", () => {
    for (let i = 0; i < 500; i++) {
      expect(sixDigitCode()).toMatch(/^\d{6}$/);
    }
  });

  test("is spread across the range rather than bunched", () => {
    // Not a proof of uniformity — that is what the rejection sampling in
    // the implementation is for. This catches the mistakes that would be
    // glaring: a fixed prefix, a missing digit, a range that is really
    // five digits wide.
    const first = new Set<string>();
    for (let i = 0; i < 2000; i++) first.add(sixDigitCode()[0]);
    expect(first.size).toBe(10);
  });

  test("does not repeat itself", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(sixDigitCode());
    // A million possibilities and a thousand draws: a handful of
    // collisions is expected, hundreds would mean a broken generator.
    expect(seen.size).toBeGreaterThan(990);
  });
});

describe("the session token", () => {
  test("is URL-safe and long enough to be unguessable", () => {
    const token = sessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(43); // 32 bytes, base64url
  });

  test("is different every time", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(sessionToken());
    expect(seen.size).toBe(1000);
  });
});
