/**
 * Rules that make the tenant boundary mechanical rather than a convention.
 *
 * src/db/tenant.ts can only be the boundary if nothing reaches around it.
 * A comment asking people not to is worth very little — this codebase has
 * already shown, twice in the Python version, what "remember to" is worth.
 * So the rule is checked.
 *
 * There are legitimate reasons to hold an unscoped handle: authentication
 * runs before a tenant is known, the built-in module types are shared
 * across tenants by design, and signing in for the first time has to create
 * the organization it will then be scoped to. Each is allowed here by name,
 * so a fourth has to be argued for in a diff rather than slipped in.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const SRC = path.join(import.meta.dirname, "..", "src");

/** Files permitted to hold a database handle that is not tenant-scoped. */
const MAY_BE_UNSCOPED = new Set([
  "db/tenant.ts", // defines the boundary
  "db/index.ts", // constructs the handle in the first place
  // Looks up a session, resolves which organization the caller acts as,
  // and provisions an account on first sign-in. All three necessarily
  // happen before a tenant is known. Note what is NOT here: routes/auth.ts
  // touches no table, it calls this module — which is why the exception
  // stays one file rather than spreading to the endpoints that use it.
  "auth.ts",
  "moduleTypes.ts", // built-in types are shared and have no organization
]);

function sourceFiles(dir = SRC, prefix = ""): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...sourceFiles(path.join(dir, entry.name), rel));
    } else if (entry.name.endsWith(".ts")) {
      out.push([rel, fs.readFileSync(path.join(dir, entry.name), "utf8")]);
    }
  }
  return out;
}

describe("the tenant boundary is not reached around", () => {
  test("only named files import unscoped()", () => {
    const offenders = sourceFiles()
      .filter(([rel]) => !MAY_BE_UNSCOPED.has(rel))
      .filter(([, body]) => /\bunscoped\s*\(/.test(body) || /\bunscoped\b.*from/.test(body))
      .map(([rel]) => rel);

    expect(offenders,
      "Disse filene henter et ikke-scopet databasehåndtak. Enten skal de " +
      "bruke Tenant, eller så må de begrunnes og legges til i " +
      "MAY_BE_UNSCOPED — som er et valg noen skal se i en diff.",
    ).toEqual([]);
  });

  test("only named files construct a database handle", () => {
    // drizzle(env.DB) anywhere else is the same hole by another route.
    const offenders = sourceFiles()
      .filter(([rel]) => !MAY_BE_UNSCOPED.has(rel))
      .filter(([, body]) => /\bdrizzle\s*\(/.test(body))
      .map(([rel]) => rel);

    expect(offenders).toEqual([]);
  });

  test("nothing outside the db layer touches the raw D1 binding", () => {
    // env.DB.prepare(...) bypasses Drizzle and the scoping with it.
    const offenders = sourceFiles()
      .filter(([rel]) => !rel.startsWith("db/"))
      .filter(([, body]) => /env\.DB\b/.test(body))
      .map(([rel]) => rel);

    expect(offenders).toEqual([]);
  });
});

describe("the boundary covers what it claims to", () => {
  /**
   * Tables that carry a required organization but are deliberately not
   * reached through Tenant. Each needs a reason, because the default has to
   * be that a tenant column means tenant scoping.
   */
  const NOT_TENANT_SCOPED: Record<string, string> = {
    membership:
      "read while working out who is calling, which is necessarily before " +
      "a tenant is known — scoping it through Tenant would be circular",
  };

  test("a table with a required organization is scoped, or excused by name", () => {
    const schema = fs.readFileSync(path.join(SRC, "schema.ts"), "utf8");

    const tables = [...schema.matchAll(/export const (\w+) = sqliteTable\(/g)].map(
      (m) => m[1],
    );

    const requiresTenant = tables.filter((name) => {
      const start = schema.indexOf(`export const ${name} = sqliteTable(`);
      const next = schema.indexOf("export const ", start + 1);
      const body = schema.slice(start, next === -1 ? undefined : next);

      // That one column's definition, which may span several lines, and
      // nothing after it. Terminating on ";" instead — as this did at
      // first — swallows the neighbouring columns and reports every table
      // with any required field as tenant-scoped.
      const column = body.match(
        /organizationId: integer\("organization_id"\)([\s\S]*?)(?=\n\s{4}\w+:|\n\s{2}\},)/,
      );
      return column ? column[1].includes(".notNull()") : false;
    });

    const listed = new Set(
      schema
        .slice(schema.indexOf("export const TENANT_TABLES"))
        .match(/\n\s{2}(\w+),/g)
        ?.map((line) => line.trim().replace(",", "")) ?? [],
    );

    const unaccounted = requiresTenant.filter(
      (name) => !listed.has(name) && !(name in NOT_TENANT_SCOPED),
    );

    expect(unaccounted,
      "Disse tabellene krever en organisasjon, men er verken i " +
      "TENANT_TABLES eller unntatt med begrunnelse. Standarden må være at " +
      "en tenant-kolonne betyr tenant-scoping.",
    ).toEqual([]);
  });

  test("nothing is listed as tenant-scoped without carrying a tenant", () => {
    // The reverse hole: a table in TENANT_TABLES without the column would
    // make every scoped query on it match nothing, silently.
    const schema = fs.readFileSync(path.join(SRC, "schema.ts"), "utf8");
    const listed =
      schema
        .slice(schema.indexOf("export const TENANT_TABLES"))
        .match(/\n\s{2}(\w+),/g)
        ?.map((line) => line.trim().replace(",", "")) ?? [];

    for (const name of listed) {
      const start = schema.indexOf(`export const ${name} = sqliteTable(`);
      expect(start, `${name} finnes ikke i skjemaet`).toBeGreaterThan(-1);
      const next = schema.indexOf("export const ", start + 1);
      const body = schema.slice(start, next === -1 ? undefined : next);
      expect(body, `${name} mangler organization_id`).toContain(
        'organizationId: integer("organization_id")',
      );
    }
    expect(listed.length).toBe(9);
  });
});
