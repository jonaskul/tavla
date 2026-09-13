/**
 * The tenant boundary.
 *
 * On PostgreSQL these properties were enforced by the database. Here they
 * rest entirely on src/db/tenant.ts, so they are worth pinning down one at
 * a time, against a real SQLite built from the same migration D1 gets.
 *
 * The question each asks is not "does scoping work when used correctly"
 * but "can it be got around".
 */

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import * as s from "../src/schema";
import { NotScopedError, Tenant } from "../src/db/tenant";
import { freshDb, makeOrg } from "./helpers";

let db: ReturnType<typeof freshDb>;
let mine: Tenant;
let theirs: Tenant;

beforeEach(async () => {
  db = freshDb();
  mine = new Tenant(db as never, await makeOrg(db, "Mitt firma"));
  theirs = new Tenant(db as never, await makeOrg(db, "Andre firma"));
});

// --- The boundary ---------------------------------------------------------

describe("two tenants", () => {
  test("do not see each other's rows in a listing", async () => {
    await mine.insert(s.property, { name: "Mitt", address: "Min vei 1" });
    await theirs.insert(s.property, { name: "Deres", address: "Deres vei 2" });

    expect((await mine.list(s.property)).map((p) => p.name)).toEqual(["Mitt"]);
    expect((await theirs.list(s.property)).map((p) => p.name)).toEqual(["Deres"]);
  });

  test("cannot fetch each other's rows by id", async () => {
    const ours = await mine.insert(s.property, { name: "Mitt", address: "A" });

    // Null, not an error: the handler turns it into 404, so the shape of
    // the refusal does not reveal that the id exists.
    expect(await theirs.find(s.property, ours.id)).toBeNull();
    expect(await mine.find(s.property, ours.id)).not.toBeNull();
  });

  test("cannot update each other's rows", async () => {
    const ours = await mine.insert(s.property, { name: "Mitt", address: "A" });

    expect(await theirs.update(s.property, ours.id, { name: "Kapret" })).toBeNull();
    expect((await mine.find(s.property, ours.id))!.name).toBe("Mitt");
  });

  test("cannot delete each other's rows", async () => {
    const ours = await mine.insert(s.property, { name: "Mitt", address: "A" });

    expect(await theirs.remove(s.property, ours.id)).toBe(false);
    expect(await mine.find(s.property, ours.id)).not.toBeNull();
  });

  test("count only their own", async () => {
    await mine.insert(s.property, { name: "A", address: "1" });
    await mine.insert(s.property, { name: "B", address: "2" });
    await theirs.insert(s.property, { name: "C", address: "3" });

    expect(await mine.count(s.property)).toBe(2);
    expect(await theirs.count(s.property)).toBe(1);
  });

  test("cannot reach each other through a bulk update", async () => {
    const ours = await mine.insert(s.property, { name: "Mitt", address: "A" });

    const touched = await theirs.updateWhere(
      s.property,
      eq(s.property.name, "Mitt"),
      { name: "Kapret" },
    );

    expect(touched).toBe(0);
    expect((await mine.find(s.property, ours.id))!.name).toBe("Mitt");
  });

  test("cannot reach each other through a bulk delete", async () => {
    await mine.insert(s.property, { name: "Mitt", address: "A" });

    expect(await theirs.removeWhere(s.property, eq(s.property.name, "Mitt"))).toBe(0);
    expect(await mine.count(s.property)).toBe(1);
  });
});

// --- Writes are stamped ---------------------------------------------------

describe("inserting", () => {
  test("stamps the acting organization", async () => {
    const row = await mine.insert(s.property, { name: "Mitt", address: "A" });
    expect(row.organizationId).toBe(mine.organizationId);
  });

  test("ignores an organization supplied by the caller", async () => {
    // The interesting case is not a developer mistake but a request body
    // that reached this far. Passing a tenant must never place a row in it.
    const row = await mine.insert(s.property, {
      name: "Mitt",
      address: "A",
      organizationId: theirs.organizationId,
    } as never);

    expect(row.organizationId).toBe(mine.organizationId);
    expect(await theirs.count(s.property)).toBe(0);
  });

  test("an update cannot move a row to another organization", async () => {
    const ours = await mine.insert(s.property, { name: "Mitt", address: "A" });

    await mine.update(s.property, ours.id, {
      organizationId: theirs.organizationId,
    } as never);

    expect((await mine.find(s.property, ours.id))!.organizationId).toBe(
      mine.organizationId,
    );
    expect(await theirs.count(s.property)).toBe(0);
  });
});

// --- What cannot be expressed ---------------------------------------------

describe("the surface itself", () => {
  test("there is no way to ask for every row", () => {
    // Not a runtime assertion so much as a statement of the design: no
    // method takes "across all tenants" as an argument, so the unscoped
    // query has nowhere to be written. If one is ever added, this comment
    // and the architecture test are what should stop it.
    const methods = Object.getOwnPropertyNames(Tenant.prototype);
    expect(methods).not.toContain("all");
    expect(methods).not.toContain("unscoped");
    expect(methods).not.toContain("raw");
  });

  test("a table without a tenant column is refused", async () => {
    // app_user has no organization_id: it is read before a tenant is
    // known. Reaching it through Tenant would be a mistake, and says so.
    await expect(
      mine.list(s.appUser as never),
    ).rejects.toBeInstanceOf(NotScopedError);
  });

  test("an invalid organization is refused at construction", () => {
    // Scoping to undefined would compare as NULL in SQL and silently match
    // nothing — a bug that looks like an empty account rather than an error.
    for (const bad of [undefined, null, 0, -1, NaN, "3"]) {
      expect(() => new Tenant(db as never, bad as never)).toThrow(NotScopedError);
    }
  });
});

// --- Every content table, not just the one that is easy to test -----------

describe("every tenant table", () => {
  test("actually carries the tenant column", () => {
    // A table added to TENANT_TABLES without the column would make every
    // scoped query on it a silent no-op rather than an error.
    for (const table of s.TENANT_TABLES) {
      expect(
        Object.keys(table).includes("organizationId"),
      ).toBe(true);
    }
    expect(s.TENANT_TABLES.length).toBe(9);
  });

  test("rejects a cross-tenant read for each", async () => {
    const property = await mine.insert(s.property, { name: "P", address: "A" });
    const panel = await mine.insert(s.panel, {
      propertyId: property.id, name: "Skap", location: "Gang",
    });
    const circuit = await mine.insert(s.circuit, {
      panelId: panel.id, designation: "B01", name: "Lys",
    });
    const cp = await mine.insert(s.connectionPoint, {
      circuitId: circuit.id, type: "outlet", location: "Stue",
    });
    const equipment = await mine.insert(s.equipment, {
      circuitId: circuit.id, type: "dynalite",
    });

    const rows: Array<[(typeof s.TENANT_TABLES)[number], number]> = [
      [s.property, property.id],
      [s.panel, panel.id],
      [s.circuit, circuit.id],
      [s.connectionPoint, cp.id],
      [s.equipment, equipment.id],
      [s.module, (await mine.insert(s.module, {
        panelId: panel.id, row: 0, position: 0, width: 1, type: "breaker",
      })).id],
      [s.channel, (await mine.insert(s.channel, {
        equipmentId: equipment.id, number: 1,
      })).id],
      [s.file, (await mine.insert(s.file, {
        connectionPointId: cp.id, filename: "a.jpg",
        mimetype: "image/jpeg", storageKey: "org-1/a.jpg",
      })).id],
      [s.changelog, (await mine.insert(s.changelog, {
        circuitId: circuit.id, description: "Notat",
      })).id],
    ];

    expect(rows.length).toBe(s.TENANT_TABLES.length);

    for (const [table, id] of rows) {
      expect(await theirs.find(table, id)).toBeNull();
      expect(await mine.find(table, id)).not.toBeNull();
    }
  });
});