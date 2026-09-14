/**
 * The error shapes the frontend already knows.
 *
 * FastAPI answers a failed validation with 422 and a list under "detail",
 * and everything else with a string under the same key. The frontend and
 * the contract suite were written against that, so the rewrite reproduces
 * it rather than inventing something tidier. Parity is the whole point of
 * doing this against a contract.
 */

import { HTTPException } from "hono/http-exception";

/**
 * A refusal the client is meant to read.
 *
 * 422 is in the list because FastAPI's own 422 body — a list under
 * "detail" — is only what its *validation* produces. An explicit
 * HTTPException(422, detail="...") answers with a plain string, and two
 * endpoints rely on that. See `invalid` for the other shape.
 */
export function fail(
  status: 400 | 401 | 403 | 404 | 409 | 413 | 422,
  detail: string,
): HTTPException {
  return new HTTPException(status, {
    res: Response.json({ detail }, { status }),
  });
}

interface ValidationProblem {
  type: string;
  loc: string[];
  msg: string;
}

export function invalid(problems: ValidationProblem[]): HTTPException {
  return new HTTPException(422, {
    res: Response.json({ detail: problems }, { status: 422 }),
  });
}

/**
 * Good enough for an address we are about to mail.
 *
 * Deliberately not RFC 5322: that grammar accepts things no mail provider
 * will, and the real check is whether the code arrives. This rejects the
 * shapes that are certainly mistakes and lets Resend judge the rest.
 *
 * Unicode on purpose — æ@ø.no is a valid address and pydantic accepted it.
 */
const EMAIL = /^[^@\s,]+@[^@\s,.]+(\.[^@\s,.]+)+$/u;

/**
 * Domains reserved by RFC 2606 and 6761, which can never receive mail.
 *
 * Not pedantry. `scripts/smoke_test.py` probes the live sign-in endpoint
 * with an address under one of these precisely because validation refuses
 * it before any mail is attempted — so the check costs nothing and does
 * not spend the ten-per-hour rate limit. Accepting them, as the first
 * version of this did, turns that probe into a real send and running the
 * smoke test twice locks the deployer out of their own app.
 *
 * The list matches what pydantic's EmailStr refuses, checked against it
 * rather than guessed. Note that .example is absent: email-validator lets
 * it through, and matching the implementation being replaced matters more
 * than the RFC being tidy.
 */
const RESERVED_TLDS = new Set(["invalid", "test", "localhost", "local"]);

function plausibleAddress(value: string): boolean {
  if (!EMAIL.test(value)) return false;

  const domain = value.slice(value.lastIndexOf("@") + 1).toLowerCase();
  const labels = domain.split(".");

  if (RESERVED_TLDS.has(labels[labels.length - 1])) return false;
  // A label cannot start or end with a hyphen.
  return !labels.some((label) => label.startsWith("-") || label.endsWith("-"));
}

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Falls through to the same answer as a body of the wrong shape: from
    // the caller's side "not valid input" is one case, not two.
  }
  throw invalid([{ type: "model_attributes_type", loc: ["body"], msg: "Input should be a valid dictionary" }]);
}

export function requireString(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = body[field];
  if (value === undefined || value === null) {
    throw invalid([{ type: "missing", loc: ["body", field], msg: "Field required" }]);
  }
  if (typeof value !== "string") {
    throw invalid([
      { type: "string_type", loc: ["body", field], msg: "Input should be a valid string" },
    ]);
  }
  return value;
}

export function requireEmail(body: Record<string, unknown>, field: string): string {
  const value = requireString(body, field);
  if (!plausibleAddress(value.trim())) {
    throw invalid([
      {
        type: "value_error",
        loc: ["body", field],
        msg: "value is not a valid email address",
      },
    ]);
  }
  return value;
}

/**
 * An integer query parameter, or undefined when it was not given.
 *
 * A parameter that is present but not a number is a 422, as FastAPI
 * answered — not silently ignored, which would quietly return the whole
 * list where the caller asked for one panel's worth.
 */
export function intQuery(url: string, name: string): number | undefined {
  const raw = new URL(url).searchParams.get(name);
  if (raw === null) return undefined;
  if (!/^-?\d+$/.test(raw.trim())) {
    throw invalid([
      { type: "int_parsing", loc: ["query", name], msg: "Input should be a valid integer" },
    ]);
  }
  return Number(raw);
}

/**
 * An integer path parameter.
 *
 * /api/properties/abc is a 422 and not a 404: the id is malformed, which
 * is a different thing from naming something that is not there, and
 * FastAPI told them apart.
 */
export function intParam(raw: string, name: string): number {
  if (!/^\d+$/.test(raw)) {
    throw invalid([
      { type: "int_parsing", loc: ["path", name], msg: "Input should be a valid integer" },
    ]);
  }
  return Number(raw);
}
