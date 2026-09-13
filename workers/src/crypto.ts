/**
 * The small pieces of cryptography sign-in rests on.
 *
 * Python had `hmac`, `hashlib` and `secrets` in the standard library.
 * Workers has WebCrypto, which is async and lower level, so each of those
 * one-liners becomes a function here. Gathering them makes the properties
 * checkable in one test file rather than scattered through the routes.
 *
 * Three of these are easy to get subtly wrong, so each says what it is
 * defending against.
 */

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * HMAC-SHA256, hex encoded.
 *
 * Keyed rather than a bare hash because the thing being hashed is six
 * digits. A plain SHA-256 of a million possible inputs is a rainbow table
 * someone can build in seconds, so a database dump would yield working
 * codes. The key lives outside the database, so a dump alone is useless.
 */
export async function hmacHex(
  secret: Uint8Array,
  message: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    secret as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/**
 * Plain SHA-256, hex encoded. Enough for session tokens: those carry 256
 * bits of entropy, so there is no table to precompute.
 */
export async function sha256Hex(message: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(message)));
}

/**
 * Compare without leaking where two strings first differ.
 *
 * `a === b` returns as soon as it finds a difference, and that timing is
 * measurable across a network with enough samples — which turns guessing a
 * code into guessing one character at a time. Lengths differing is not
 * secret here (both sides are fixed-length digests), so that is allowed to
 * short-circuit.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let differences = 0;
  for (let i = 0; i < a.length; i++) {
    differences |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return differences === 0;
}

/**
 * A six-digit code, uniformly distributed.
 *
 * The obvious `random % 1000000` is biased: 2^32 is not a multiple of a
 * million, so the low codes come up slightly more often. The bias is tiny,
 * but it is free to avoid — draw again on the values that would cause it.
 */
export function sixDigitCode(): string {
  const CEILING = 4_294_000_000; // the largest multiple of 1e6 below 2^32
  const buffer = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= CEILING);
  return String(value % 1_000_000).padStart(6, "0");
}

/**
 * A session token: 32 random bytes, URL-safe.
 *
 * Matches `secrets.token_urlsafe(32)` on the Python side — 256 bits, which
 * is far past guessable, so the token itself needs no rate limit.
 */
export function sessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
