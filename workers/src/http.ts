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

/** A refusal the client is meant to read: 400, 401, 404, 409. */
export function fail(status: 400 | 401 | 403 | 404 | 409, detail: string): HTTPException {
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
 */
const EMAIL = /^[^@\s,]+@[^@\s,.]+(\.[^@\s,.]+)+$/;

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
  if (!EMAIL.test(value.trim())) {
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
