/**
 * Koblingspunkter — where a circuit actually reaches something.
 *
 * Every change here writes to the changelog, because that is the record an
 * electrician hands over: not what the documentation says today, but when
 * each thing was put in and when it moved.
 *
 * The write and its log entry go in one batch throughout. A log that
 * disagrees with the data is worse than no log, and on D1 the only way to
 * make two writes one is to send them together.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";

import * as s from "../schema";
import type { Env } from "../context";
import type { Tenant } from "../db";
import { fail, intParam, intQuery } from "../http";
import {
  CONNECTION_POINT_CREATE,
  CONNECTION_POINT_LABELS,
  CONNECTION_POINT_UPDATE,
  type ConnectionPointType,
  changelogRead,
  connectionPointRead,
} from "../schemas";
import { readBody } from "../validate";
import { newestFirst } from "./changelog";
import { entryOp } from "./log";
import { must } from "./lookup";

export const connectionPointRoutes = new Hono<Env>();

const owned = (tenant: Tenant, id: number) =>
  must(tenant, s.connectionPoint, id, "Connection point not found");
const idOf = (raw: string) => intParam(raw, "cp_id");

const label = (type: string) => CONNECTION_POINT_LABELS[type] ?? type;

connectionPointRoutes.get("/", async (c) => {
  const circuitId = intQuery(c.req.url, "circuit_id");
  const rows = await c
    .get("tenant")
    .list(
      s.connectionPoint,
      circuitId === undefined ? undefined : eq(s.connectionPoint.circuitId, circuitId),
    );
  return c.json(rows.map(connectionPointRead));
});

connectionPointRoutes.post("/", async (c) => {
  const tenant = c.get("tenant");
  const body = await readBody(c.req.raw, CONNECTION_POINT_CREATE);
  const circuitId = body.circuit_id as number;

  await must(tenant, s.circuit, circuitId, "Circuit not found");
  return c.json(connectionPointRead(await add(tenant, circuitId, body)));
});

/**
 * Create one under a circuit. Shared with the nested route in ./circuits.ts.
 *
 * Note that the flat route does not write a log entry and the nested one
 * does — that asymmetry is the Python version's, and it is visible in the
 * contract, so it stays. It is not defensible; it is just not this
 * rewrite's to change.
 */
export async function add(
  tenant: Tenant,
  circuitId: number,
  body: Record<string, unknown>,
) {
  return tenant.insert(s.connectionPoint, {
    circuitId,
    type: body.type as ConnectionPointType,
    location: body.location as string,
    notes: body.notes as string | null,
  });
}

export async function addLogged(
  tenant: Tenant,
  circuitId: number,
  body: Record<string, unknown>,
) {
  const cp = await add(tenant, circuitId, body);
  await tenant.atomically([
    entryOp(
      tenant,
      { circuitId },
      `Koblingspunkt opprettet: ${label(cp.type)} – ${cp.location}`,
    ),
  ]);
  return cp;
}

connectionPointRoutes.get("/:cp_id", async (c) =>
  c.json(connectionPointRead(await owned(c.get("tenant"), idOf(c.req.param("cp_id"))))),
);

connectionPointRoutes.put("/:cp_id", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("cp_id"));
  await owned(tenant, id);

  const body = await readBody(c.req.raw, CONNECTION_POINT_UPDATE, { partial: true });
  const changes: Record<string, unknown> = {};
  if ("type" in body) changes.type = body.type;
  if ("location" in body) changes.location = body.location;
  if ("notes" in body) changes.notes = body.notes;

  const row = (await tenant.update(s.connectionPoint, id, changes))!;
  await tenant.atomically([
    entryOp(
      tenant,
      { circuitId: row.circuitId },
      `Koblingspunkt oppdatert: ${label(row.type)} – ${row.location}`,
    ),
  ]);
  return c.json(connectionPointRead(row));
});

connectionPointRoutes.delete("/:cp_id", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("cp_id"));
  const row = await owned(tenant, id);

  // Photos are the evidence. Losing them to a delete of the thing they are
  // photographs of is not a cascade anybody wants.
  if (await tenant.exists(s.file, eq(s.file.connectionPointId, id))) {
    throw fail(409, "Cannot delete connection point that has files");
  }

  await tenant.atomically([
    // Its own log entries reference it, so they go first; the entry
    // recording the deletion hangs off the circuit and survives.
    tenant.op.removeWhere(s.changelog, eq(s.changelog.connectionPointId, id)),
    tenant.op.remove(s.connectionPoint, id),
    entryOp(
      tenant,
      { circuitId: row.circuitId },
      `Koblingspunkt slettet: ${label(row.type)} – ${row.location}`,
    ),
  ]);

  return c.json(connectionPointRead(row));
});

connectionPointRoutes.get("/:cp_id/changelog", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("cp_id"));
  await owned(tenant, id);

  const rows = await tenant.list(
    s.changelog,
    eq(s.changelog.connectionPointId, id),
    newestFirst,
  );
  return c.json(rows.map(changelogRead));
});
