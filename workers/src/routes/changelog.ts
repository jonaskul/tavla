/**
 * Endringsloggen.
 *
 * Append-only, deliberately. There is no PUT and no DELETE, and that is
 * the point of having a log rather than a notes field: an electrician
 * hands this over as the record of what was done and when. Hono answers
 * 404 for the methods that are not here, where FastAPI answered 405 — the
 * contract asserts neither, and nothing calls them.
 */

import { Hono } from "hono";
import { and, eq, sql, type SQL } from "drizzle-orm";

import * as s from "../schema";
import type { Env } from "../context";
import { intParam, intQuery, invalid } from "../http";
import { CHANGELOG_CREATE, changelogRead } from "../schemas";
import { readBody } from "../validate";
import { must } from "./lookup";

export const changelogRoutes = new Hono<Env>();

changelogRoutes.get("/", async (c) => {
  const filters: SQL[] = [];
  const circuitId = intQuery(c.req.url, "circuit_id");
  const cpId = intQuery(c.req.url, "connection_point_id");
  const equipmentId = intQuery(c.req.url, "equipment_id");

  if (circuitId !== undefined) filters.push(eq(s.changelog.circuitId, circuitId));
  if (cpId !== undefined) filters.push(eq(s.changelog.connectionPointId, cpId));
  if (equipmentId !== undefined) filters.push(eq(s.changelog.equipmentId, equipmentId));

  const rows = await c
    .get("tenant")
    .list(s.changelog, filters.length === 0 ? undefined : (and(...filters) as SQL));
  return c.json(rows.map(changelogRead));
});

changelogRoutes.post("/", async (c) => {
  const tenant = c.get("tenant");
  const body = await readBody(c.req.raw, CHANGELOG_CREATE);

  const circuitId = body.circuit_id as number | null;
  const cpId = body.connection_point_id as number | null;
  const equipmentId = body.equipment_id as number | null;

  // An entry attached to nothing cannot be found again by anyone. It would
  // be written, stored, and never appear in any of the three listings.
  if (circuitId === null && cpId === null && equipmentId === null) {
    throw invalid([
      {
        type: "value_error",
        loc: ["body"],
        msg:
          "Value error, At least one of circuit_id, connection_point_id, " +
          "or equipment_id must be set",
      },
    ]);
  }

  // Each named thing has to be ours, or the entry documents someone else's
  // installation from inside our account.
  if (circuitId !== null) await must(tenant, s.circuit, circuitId, "Circuit not found");
  if (cpId !== null) {
    await must(tenant, s.connectionPoint, cpId, "Connection point not found");
  }
  if (equipmentId !== null) {
    await must(tenant, s.equipment, equipmentId, "Equipment not found");
  }

  const row = await tenant.insert(s.changelog, {
    circuitId,
    connectionPointId: cpId,
    equipmentId,
    changedBy: body.changed_by as string,
    description: body.description as string,
  });
  return c.json(changelogRead(row));
});

changelogRoutes.get("/:entry_id", async (c) => {
  const id = intParam(c.req.param("entry_id"), "entry_id");
  const row = await must(c.get("tenant"), s.changelog, id, "Changelog entry not found");
  return c.json(changelogRead(row));
});

/**
 * Newest first — what the circuit view shows at the top.
 *
 * By id as well as by timestamp, and that second term is not decoration.
 * changed_at has second resolution, and the entries that matter most are
 * written together: creating equipment logs it and adds its channels in
 * one batch. Ordering on the timestamp alone left those tied, and SQLite
 * broke the tie by rowid — which is oldest first, the exact opposite of
 * what this is for.
 */
export const newestFirst = sql`${s.changelog.changedAt} desc, ${s.changelog.id} desc`;
