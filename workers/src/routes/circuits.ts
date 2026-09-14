/**
 * Kurser — circuits.
 *
 * The delete carries the scar tissue. It refuses when connection points
 * hang off the circuit, and it refuses when equipment does — the Python
 * version guarded the first and forgot the second, so deleting a circuit
 * with equipment on it answered 500 instead of 409. That pair, plus the
 * modules that point at the circuit and have to be released, is three
 * things to remember in one endpoint, which is exactly the shape of
 * mistake this codebase keeps making.
 *
 * So the release and the delete go in one batch. Not for speed: because a
 * circuit that is gone while a breaker still points at it draws a panel
 * wired to nothing, and that is a worse state than either end of it.
 */

import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";

import * as s from "../schema";
import type { Env } from "../context";
import type { Tenant } from "../db";
import { fail, intParam, intQuery } from "../http";
import {
  CIRCUIT_CREATE,
  CIRCUIT_UPDATE,
  CONNECTION_POINT_CREATE_NESTED,
  EQUIPMENT_CREATE_NESTED,
  changelogRead,
  circuitRead,
  connectionPointRead,
  equipmentRead,
} from "../schemas";
import { readBody } from "../validate";
import { newestFirst } from "./changelog";
import { addLogged } from "./connectionPoints";
import { add as addEquipment } from "./equipment";
import { must } from "./lookup";
import { addCircuit } from "./panels";

export const circuitRoutes = new Hono<Env>();

const owned = (tenant: Tenant, id: number) =>
  must(tenant, s.circuit, id, "Circuit not found");
const idOf = (raw: string) => intParam(raw, "circuit_id");

circuitRoutes.get("/", async (c) => {
  const panelId = intQuery(c.req.url, "panel_id");
  const rows = await c
    .get("tenant")
    .list(s.circuit, panelId === undefined ? undefined : eq(s.circuit.panelId, panelId));
  return c.json(rows.map(circuitRead));
});

circuitRoutes.post("/", async (c) => {
  const tenant = c.get("tenant");
  const body = await readBody(c.req.raw, CIRCUIT_CREATE);
  const panelId = body.panel_id as number;

  await must(tenant, s.panel, panelId, "Panel not found");
  return c.json(circuitRead(await addCircuit(tenant, panelId, body)));
});

circuitRoutes.get("/:circuit_id", async (c) =>
  c.json(circuitRead(await owned(c.get("tenant"), idOf(c.req.param("circuit_id"))))),
);

circuitRoutes.put("/:circuit_id", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("circuit_id"));
  await owned(tenant, id);

  const body = await readBody(c.req.raw, CIRCUIT_UPDATE, { partial: true });
  const changes: Record<string, unknown> = {};
  if ("designation" in body) changes.designation = body.designation;
  if ("name" in body) changes.name = body.name;
  if ("room" in body) changes.room = body.room;
  if ("cable_type" in body) changes.cableType = body.cable_type;
  if ("cross_section" in body) changes.crossSection = body.cross_section;
  if ("conductor_count" in body) changes.conductorCount = body.conductor_count;
  if ("length_m" in body) changes.lengthM = body.length_m;
  if ("notes" in body) changes.notes = body.notes;

  const row = await tenant.update(s.circuit, id, changes);
  return c.json(circuitRead(row!));
});

circuitRoutes.delete("/:circuit_id", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("circuit_id"));
  const row = await owned(tenant, id);

  if (await tenant.exists(s.connectionPoint, eq(s.connectionPoint.circuitId, id))) {
    throw fail(409, "Cannot delete circuit that has connection points");
  }
  if (await tenant.exists(s.equipment, eq(s.equipment.circuitId, id))) {
    throw fail(409, "Cannot delete circuit that has equipment");
  }

  await tenant.atomically([
    // Release the breakers pointing at it, or the panel view keeps drawing
    // a module wired to a circuit that is gone.
    tenant.op.updateWhere(s.module, eq(s.module.circuitId, id), { circuitId: null }),
    // Channels reference a circuit too, and nothing cleared them either.
    tenant.op.updateWhere(s.channel, eq(s.channel.circuitId, id), { circuitId: null }),
    tenant.op.removeWhere(s.changelog, eq(s.changelog.circuitId, id)),
    tenant.op.remove(s.circuit, id),
  ]);

  return c.json(circuitRead(row));
});

// --- Nested: what hangs off a circuit --------------------------------------

circuitRoutes.get("/:circuit_id/connection_points", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("circuit_id"));
  await owned(tenant, id);
  const rows = await tenant.list(s.connectionPoint, eq(s.connectionPoint.circuitId, id));
  return c.json(rows.map(connectionPointRead));
});

circuitRoutes.post("/:circuit_id/connection_points", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("circuit_id"));
  await owned(tenant, id);

  const body = await readBody(c.req.raw, CONNECTION_POINT_CREATE_NESTED);
  return c.json(connectionPointRead(await addLogged(tenant, id, body)));
});

circuitRoutes.get("/:circuit_id/equipment", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("circuit_id"));
  await owned(tenant, id);
  const rows = await tenant.list(s.equipment, eq(s.equipment.circuitId, id));
  return c.json(rows.map(equipmentRead));
});

circuitRoutes.post("/:circuit_id/equipment", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("circuit_id"));
  await owned(tenant, id);

  const body = await readBody(c.req.raw, EQUIPMENT_CREATE_NESTED);
  return c.json(equipmentRead(await addEquipment(tenant, id, body)));
});

circuitRoutes.get("/:circuit_id/changelog", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("circuit_id"));
  await owned(tenant, id);

  const rows = await tenant.list(s.changelog, eq(s.changelog.circuitId, id), newestFirst);
  return c.json(rows.map(changelogRead));
});
