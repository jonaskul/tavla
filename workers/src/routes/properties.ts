/**
 * Anlegg — the root of the tree everything else hangs from.
 *
 * Note what is not here: any mention of which organization is asking. The
 * tenant filter lives in `c.get("tenant")`, and every read below is scoped
 * because there is no way to write one that is not.
 *
 * On the Python side this was the only router that filtered by hand.
 * panels.py, circuits.py and modules.py left it to PostgreSQL's row-level
 * security — which worked, but put the isolation of three quarters of the
 * API in a migration rather than in the code, and meant the same three
 * routers leaked across tenants when run on SQLite. Here it is uniform,
 * and it is uniform because it is not optional.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";

import * as s from "../schema";
import type { Env } from "../context";
import type { Tenant } from "../db";
import { fail, intParam } from "../http";
import {
  PANEL_CREATE_NESTED,
  PROPERTY_CREATE,
  PROPERTY_UPDATE,
  panelRead,
  propertyRead,
} from "../schemas";
import { readBody } from "../validate";
import { must } from "./lookup";

export const propertyRoutes = new Hono<Env>();

/** 404 covers both "no such property" and "not yours" — see ./lookup.ts. */
const owned = (tenant: Tenant, id: number) =>
  must(tenant, s.property, id, "Property not found");

const idOf = (raw: string) => intParam(raw, "property_id");

propertyRoutes.get("/", async (c) =>
  c.json((await c.get("tenant").list(s.property)).map(propertyRead)),
);

propertyRoutes.post("/", async (c) => {
  const body = await readBody(c.req.raw, PROPERTY_CREATE);
  const row = await c.get("tenant").insert(s.property, {
    name: body.name as string,
    address: body.address as string,
    ownerName: body.owner_name as string | null,
    ownerEmail: body.owner_email as string | null,
    ownerPhone: body.owner_phone as string | null,
  });
  return c.json(propertyRead(row));
});

propertyRoutes.get("/:property_id", async (c) => {
  const row = await owned(c.get("tenant"), idOf(c.req.param("property_id")));
  return c.json(propertyRead(row));
});

propertyRoutes.put("/:property_id", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("property_id"));
  await owned(tenant, id);

  // Only what was sent. A PUT from the edit dialog carries the field that
  // changed, and treating absent as null would clear the rest.
  const body = await readBody(c.req.raw, PROPERTY_UPDATE, { partial: true });
  const changes: Record<string, unknown> = {};
  if ("name" in body) changes.name = body.name;
  if ("address" in body) changes.address = body.address;
  if ("owner_name" in body) changes.ownerName = body.owner_name;
  if ("owner_email" in body) changes.ownerEmail = body.owner_email;
  if ("owner_phone" in body) changes.ownerPhone = body.owner_phone;

  const row = await tenant.update(s.property, id, changes);
  return c.json(propertyRead(row!));
});

propertyRoutes.delete("/:property_id", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("property_id"));
  const row = await owned(tenant, id);

  // 409 rather than a cascade. A panel is not an implementation detail of
  // a property — losing one to a mistyped delete is losing the work.
  if (await tenant.exists(s.panel, eq(s.panel.propertyId, id))) {
    throw fail(409, "Cannot delete property that has panels");
  }

  await tenant.remove(s.property, id);
  return c.json(propertyRead(row));
});

// --- Nested panels ---------------------------------------------------------

propertyRoutes.get("/:property_id/panels", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("property_id"));
  await owned(tenant, id);
  return c.json((await tenant.list(s.panel, eq(s.panel.propertyId, id))).map(panelRead));
});

propertyRoutes.post("/:property_id/panels", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("property_id"));
  await owned(tenant, id);

  const body = await readBody(c.req.raw, PANEL_CREATE_NESTED);
  const row = await tenant.insert(s.panel, {
    propertyId: id,
    name: body.name as string,
    location: body.location as string,
    rows: body.rows as number,
    modulesPerRow: body.modules_per_row as number,
    notes: body.notes as string | null,
  });
  return c.json(panelRead(row));
});
