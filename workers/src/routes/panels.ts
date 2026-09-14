/**
 * Skap — panels, and the circuits and modules that live in them.
 *
 * The delete is the part worth reading. A panel's modules are layout, not
 * records, so they go with it; its circuits are records, so their presence
 * refuses the delete. Getting that pair wrong is how the Python version
 * managed to return 500 for the ordinary case of deleting a populated
 * panel — nothing declared the cascade, so the delete tried to orphan the
 * modules and hit a NOT NULL constraint.
 */

import { Hono } from "hono";
import { and, eq } from "drizzle-orm";

import * as s from "../schema";
import type { Env } from "../context";
import type { Tenant } from "../db";
import { fail, intParam, intQuery } from "../http";
import { findByKey } from "../moduleTypes";
import {
  CIRCUIT_CREATE_NESTED,
  MODULE_CREATE_NESTED,
  PANEL_CREATE,
  PANEL_UPDATE,
  circuitRead,
  moduleRead,
  panelRead,
} from "../schemas";
import type { CableType } from "../schemas";
import { readBody } from "../validate";
import { must } from "./lookup";
import { checkCircuit, occupied } from "./placement";

export const panelRoutes = new Hono<Env>();

const owned = (tenant: Tenant, id: number) => must(tenant, s.panel, id, "Panel not found");
const idOf = (raw: string) => intParam(raw, "panel_id");

panelRoutes.get("/", async (c) => {
  const propertyId = intQuery(c.req.url, "property_id");
  const rows = await c
    .get("tenant")
    .list(s.panel, propertyId === undefined ? undefined : eq(s.panel.propertyId, propertyId));
  return c.json(rows.map(panelRead));
});

panelRoutes.post("/", async (c) => {
  const tenant = c.get("tenant");
  const body = await readBody(c.req.raw, PANEL_CREATE);
  const propertyId = body.property_id as number;

  // The flat route names the property in the body; it still has to be one
  // of ours, and "not yours" answers the same as "not there".
  await must(tenant, s.property, propertyId, "Property not found");

  const row = await tenant.insert(s.panel, {
    propertyId,
    name: body.name as string,
    location: body.location as string,
    rows: body.rows as number,
    modulesPerRow: body.modules_per_row as number,
    notes: body.notes as string | null,
  });
  return c.json(panelRead(row));
});

panelRoutes.get("/:panel_id", async (c) =>
  c.json(panelRead(await owned(c.get("tenant"), idOf(c.req.param("panel_id"))))),
);

panelRoutes.put("/:panel_id", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("panel_id"));
  await owned(tenant, id);

  const body = await readBody(c.req.raw, PANEL_UPDATE, { partial: true });
  const changes: Record<string, unknown> = {};
  if ("name" in body) changes.name = body.name;
  if ("location" in body) changes.location = body.location;
  if ("rows" in body) changes.rows = body.rows;
  if ("modules_per_row" in body) changes.modulesPerRow = body.modules_per_row;
  if ("notes" in body) changes.notes = body.notes;

  const row = await tenant.update(s.panel, id, changes);
  return c.json(panelRead(row!));
});

panelRoutes.delete("/:panel_id", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("panel_id"));
  const row = await owned(tenant, id);

  if (await tenant.exists(s.circuit, eq(s.circuit.panelId, id))) {
    throw fail(409, "Cannot delete panel that has circuits");
  }

  // Modules are the panel's layout and go with it. One batch, so a panel
  // never survives with its modules already gone — D1 has no interactive
  // transaction, but a batch either lands whole or not at all.
  await tenant.atomically([
    tenant.op.removeWhere(s.module, eq(s.module.panelId, id)),
    tenant.op.remove(s.panel, id),
  ]);

  return c.json(panelRead(row));
});

// --- Nested circuits -------------------------------------------------------

panelRoutes.get("/:panel_id/circuits", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("panel_id"));
  await owned(tenant, id);
  return c.json((await tenant.list(s.circuit, eq(s.circuit.panelId, id))).map(circuitRead));
});

panelRoutes.post("/:panel_id/circuits", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("panel_id"));
  await owned(tenant, id);

  const body = await readBody(c.req.raw, CIRCUIT_CREATE_NESTED);
  return c.json(circuitRead(await addCircuit(tenant, id, body)));
});

/**
 * Create a circuit under a panel.
 *
 * Shared with the flat route in ./circuits.ts. The designation check is
 * the reason it is worth sharing: B01 twice in one panel is the mistake
 * this whole application exists to prevent, and having the rule in one
 * place is better than having it in two that agree today.
 */
export async function addCircuit(
  tenant: Tenant,
  panelId: number,
  body: Record<string, unknown>,
) {
  const designation = body.designation as string;
  const duplicate = await tenant.exists(
    s.circuit,
    and(eq(s.circuit.panelId, panelId), eq(s.circuit.designation, designation)),
  );
  if (duplicate) {
    throw fail(400, "Circuit designation already used in this panel");
  }

  return tenant.insert(s.circuit, {
    panelId,
    designation,
    name: body.name as string,
    room: body.room as string | null,
    cableType: body.cable_type as CableType | null,
    crossSection: body.cross_section as number | null,
    conductorCount: body.conductor_count as number | null,
    lengthM: body.length_m as number | null,
    notes: body.notes as string | null,
  });
}

// --- Nested modules --------------------------------------------------------

panelRoutes.get("/:panel_id/modules", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("panel_id"));
  await owned(tenant, id);
  return c.json((await tenant.list(s.module, eq(s.module.panelId, id))).map(moduleRead));
});

panelRoutes.post("/:panel_id/modules", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("panel_id"));
  const panel = await owned(tenant, id);

  const body = await readBody(c.req.raw, MODULE_CREATE_NESTED);
  const row = body.row as number;
  const position = body.position as number;
  const width = body.width as number;
  const type = body.type as string;
  const circuitId = body.circuit_id as number | null;

  // Inside the panel, in both directions. A module that hangs off the end
  // of the rail renders half-drawn rather than failing visibly.
  if (row < 0 || row >= panel.rows) {
    throw fail(400, "Row out of bounds");
  }
  if (position < 0 || position + width > panel.modulesPerRow) {
    throw fail(400, "Position out of bounds");
  }
  if (await occupied(tenant, id, row, position, width)) {
    throw fail(409, "Module overlaps with existing module");
  }

  // An unknown type would render as a blank slot with no way to tell why.
  if (!(await findByKey(c.env, tenant.organizationId, type))) {
    throw fail(422, `Unknown module type: ${type}`);
  }
  await checkCircuit(c.env, tenant, type, body.is_vacant as boolean, circuitId);

  const created = await tenant.insert(s.module, {
    panelId: id,
    row,
    position,
    width,
    type,
    label: body.label as string | null,
    ampere: body.ampere as number | null,
    hasRcd: body.has_rcd as boolean,
    circuitId,
    isVacant: body.is_vacant as boolean,
  });
  return c.json(moduleRead(created));
});
