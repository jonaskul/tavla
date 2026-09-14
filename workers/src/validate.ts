/**
 * Request bodies, checked the way pydantic checked them.
 *
 * Not a general validation library: a small one that reproduces the
 * specific behaviour schemas.py had, because that behaviour is the
 * contract. Three parts of it matter and are easy to get wrong:
 *
 * - **Absent is not null.** A PUT sends only what changed, and pydantic's
 *   `exclude_unset` meant a field left out was untouched rather than
 *   cleared. `partial` below is that distinction, and getting it backwards
 *   would silently wipe fields on every edit.
 * - **Numbers may arrive as strings.** pydantic ran in lax mode, so "2"
 *   became 2. The frontend does parse its form fields, but it does so in a
 *   dozen places and one of them will eventually not. Being stricter than
 *   the implementation being replaced is still a contract change.
 * - **The 422 body has a shape.** FastAPI answers with a list under
 *   "detail", and that is what the frontend reads.
 */

import { invalid } from "./http";

export type FieldKind = "string" | "int" | "number" | "boolean";

export interface Field {
  kind: FieldKind;
  /** Must be present on a create. */
  required?: boolean;
  /** Used on a create when the caller left it out. */
  default?: unknown;
  /** Explicit null is allowed — how the frontend clears an optional field. */
  nullable?: boolean;
  /** Accepted values, for the enum columns. */
  values?: readonly string[];
  min?: number;
  max?: number;
  maxLength?: number;
}

export type Shape = Record<string, Field>;

/** Present, and not one of the JSON shapes that mean "no value". */
function given(value: unknown): boolean {
  return value !== undefined;
}

function coerceInt(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isInteger(value) ? value : undefined;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number(value);
  }
  return undefined;
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === 0 || value === 1) return value === 1;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

interface Problem {
  type: string;
  loc: string[];
  msg: string;
}

function checkOne(name: string, field: Field, raw: unknown, problems: Problem[]): unknown {
  const at = ["body", name];

  if (raw === null) {
    if (field.nullable !== false && !field.required) return null;
    problems.push({ type: "null_not_allowed", loc: at, msg: "Input should not be null" });
    return undefined;
  }

  if (field.kind === "string") {
    if (typeof raw !== "string") {
      problems.push({ type: "string_type", loc: at, msg: "Input should be a valid string" });
      return undefined;
    }
    if (field.values && !field.values.includes(raw)) {
      problems.push({
        type: "enum",
        loc: at,
        msg: `Input should be ${field.values.map((v) => `'${v}'`).join(" or ")}`,
      });
      return undefined;
    }
    if (field.maxLength !== undefined && raw.length > field.maxLength) {
      problems.push({
        type: "string_too_long",
        loc: at,
        msg: `String should have at most ${field.maxLength} characters`,
      });
      return undefined;
    }
    return raw;
  }

  if (field.kind === "boolean") {
    const value = coerceBoolean(raw);
    if (value === undefined) {
      problems.push({ type: "bool_parsing", loc: at, msg: "Input should be a valid boolean" });
      return undefined;
    }
    return value;
  }

  const value = field.kind === "int" ? coerceInt(raw) : coerceNumber(raw);
  if (value === undefined) {
    problems.push({
      type: field.kind === "int" ? "int_parsing" : "float_parsing",
      loc: at,
      msg:
        field.kind === "int"
          ? "Input should be a valid integer"
          : "Input should be a valid number",
    });
    return undefined;
  }
  if (field.min !== undefined && value < field.min) {
    problems.push({
      type: "greater_than_equal",
      loc: at,
      msg: `Input should be greater than or equal to ${field.min}`,
    });
    return undefined;
  }
  if (field.max !== undefined && value > field.max) {
    problems.push({
      type: "less_than_equal",
      loc: at,
      msg: `Input should be less than or equal to ${field.max}`,
    });
    return undefined;
  }
  return value;
}

/**
 * Read a body against a shape.
 *
 * `partial` is the PUT case: only what was sent comes back, so a caller
 * can tell "left alone" from "set to null" by asking whether the key is
 * there. Unknown keys are ignored, as pydantic's default was — the
 * frontend sends whole objects back on some edits.
 */
export async function readBody(
  request: Request,
  shape: Shape,
  options: { partial?: boolean } = {},
): Promise<Record<string, unknown>> {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    throw invalid([
      {
        type: "model_attributes_type",
        loc: ["body"],
        msg: "Input should be a valid dictionary",
      },
    ]);
  }

  const problems: Problem[] = [];
  const out: Record<string, unknown> = {};

  for (const [name, field] of Object.entries(shape)) {
    const raw = body[name];

    if (!given(raw)) {
      if (options.partial) continue;
      if (field.required) {
        problems.push({ type: "missing", loc: ["body", name], msg: "Field required" });
        continue;
      }
      out[name] = field.default !== undefined ? field.default : null;
      continue;
    }

    const value = checkOne(name, field, raw, problems);
    if (value !== undefined) out[name] = value;
  }

  if (problems.length > 0) throw invalid(problems);
  return out;
}
