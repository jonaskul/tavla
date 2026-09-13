/**
 * Everything the worker reads from its environment, in one place.
 *
 * On the Python side this was a module of constants read once at import,
 * because a process is started once. A Worker is not: bindings arrive with
 * each request and an isolate can be discarded at any moment. So this is a
 * function of `env` rather than a snapshot, and nothing here is cached.
 *
 * That difference is not cosmetic. config.py falls back to a random
 * session secret when none is set, which in a long-lived process merely
 * invalidates sessions on restart. Here it would mean a code issued by one
 * isolate cannot be verified by the next — sign-in would fail seemingly at
 * random. `secretFor` therefore refuses to invent one in production and
 * uses a fixed, obviously-fake one everywhere else.
 */

export interface Bindings {
  DB: D1Database;
  FILES: R2Bucket;

  /** "development" | "production". Decides how strict the checks below are. */
  TAVLA_ENV?: string;

  /** Keys the one-time codes. Set with `wrangler secret put SESSION_SECRET`. */
  SESSION_SECRET?: string;

  /** Mail. Without both, codes are written to the log instead of sent. */
  RESEND_API_KEY?: string;
  AUTH_FROM_EMAIL?: string;

  /** Cookie shape. The defaults are the production ones. */
  COOKIE_SECURE?: string;
  COOKIE_SAMESITE?: string;
  COOKIE_DOMAIN?: string;
}

export class ConfigError extends Error {}

/** Only ever "0" turns a flag off, so a typo fails safe. */
function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value !== "0";
}

export function isProduction(env: Bindings): boolean {
  return (env.TAVLA_ENV ?? "development").toLowerCase() === "production";
}

/**
 * A development secret that is the same in every isolate.
 *
 * Fixed on purpose: a random one would make sign-in fail intermittently
 * and look like a bug in the code rather than a missing secret. It is
 * written to be unmistakable in a diff if it ever reaches a deploy.
 */
const DEVELOPMENT_SECRET = "utvikling-ikke-en-hemmelighet";

export function secretFor(env: Bindings): Uint8Array {
  const secret = env.SESSION_SECRET;
  if (secret) return new TextEncoder().encode(secret);

  if (isProduction(env)) {
    throw new ConfigError(
      "SESSION_SECRET mangler. Uten den kan en engangskode utstedt av én " +
        "isolat ikke verifiseres av det neste.",
    );
  }
  return new TextEncoder().encode(DEVELOPMENT_SECRET);
}

export interface CookieSettings {
  secure: boolean;
  sameSite: "Lax" | "Strict" | "None";
  domain?: string;
}

export function cookieSettings(env: Bindings): CookieSettings {
  const secure = flag(env.COOKIE_SECURE, true);
  const raw = (env.COOKIE_SAMESITE ?? "lax").toLowerCase();
  const sameSite = raw === "strict" ? "Strict" : raw === "none" ? "None" : "Lax";

  // SameSite=None without Secure is rejected by browsers outright, which
  // would leave the session cookie silently dropped rather than merely
  // weakened. Refuse the combination here instead.
  if (sameSite === "None" && !secure) {
    throw new ConfigError("COOKIE_SAMESITE=none krever COOKIE_SECURE=1");
  }

  return { secure, sameSite, domain: env.COOKIE_DOMAIN || undefined };
}
