/**
 * Moving and removing modules.
 *
 * A module is a drawn thing: the panel view drags it to a new position and
 * PUTs the result. So the interesting work here is refusing a move, and
 * refusing it without having half-applied it — the dragged module snaps
 * back, and what it snaps back to had better still be true.
 */

import { Hono } from "hono";

import * as s from "../schema";
import type { Env } from "../context";
import { fail, intParam } from "../http";
import { findByKey } from "../moduleTypes";
import { MODULE_UPDATE, moduleRead } from "../schemas";
import { readBody } from "../validate";
import { must } from "./lookup";
import { checkCircuit, occupied } from "./placement";

export const moduleRoutes = new Hono<Env>();

const idOf = (raw: string) => intParam(raw, "module_id");

moduleRoutes.put("/:module_id", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("module_id"));
  const module = await must(tenant, s.module, id, "Module not found");

  const body = await readBody(c.req.raw, MODULE_UPDATE, { partial: true });

  const row = "row" in body ? (body.row as number) : module.row;
  const position = "position" in body ? (body.position as number) : module.position;
  const width = "width" in body ? (body.width as number) : module.width;

  if ("row" in body || "position" in body || "width" in body) {
    const panel = await tenant.find(s.panel, module.panelId);

    // 422 here where creation answers 400 for the same mistake. The
    // difference is inherited from the Python version and is in the
    // contract, so it stays; see ./placement.ts.
    if (panel && position + width > panel.modulesPerRow) {
      throw fail(422, "Posisjon er utenfor skapets grenser");
    }
    if (await occupied(tenant, module.panelId, row, position, width, id)) {
      throw fail(409, "Posisjon er opptatt av en annen modul");
    }
  }

  const type = "type" in body ? (body.type as string) : module.type;
  const isVacant = "is_vacant" in body ? (body.is_vacant as boolean) : module.isVacant;
  const circuitId =
    "circuit_id" in body ? (body.circuit_id as number | null) : module.circuitId;

  // Only when the type was actually sent. Changing a module's position
  // must not start failing because its type was retired from the list.
  if ("type" in body && !(await findByKey(c.env, tenant.organizationId, type))) {
    throw fail(422, `Unknown module type: ${type}`);
  }
  await checkCircuit(c.env, tenant, type, isVacant, circuitId);

  const changes: Record<string, unknown> = {};
  if ("row" in body) changes.row = body.row;
  if ("position" in body) changes.position = body.position;
  if ("width" in body) changes.width = body.width;
  if ("type" in body) changes.type = body.type;
  if ("label" in body) changes.label = body.label;
  if ("ampere" in body) changes.ampere = body.ampere;
  if ("has_rcd" in body) changes.hasRcd = body.has_rcd;
  if ("circuit_id" in body) changes.circuitId = body.circuit_id;
  if ("is_vacant" in body) changes.isVacant = body.is_vacant;

  const updated = await tenant.update(s.module, id, changes);
  return c.json(moduleRead(updated!));
});

moduleRoutes.delete("/:module_id", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("module_id"));
  const module = await must(tenant, s.module, id, "Module not found");

  await tenant.remove(s.module, id);
  return c.json(moduleRead(module));
});
