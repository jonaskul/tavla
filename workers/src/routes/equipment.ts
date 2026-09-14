/**
 * Fastmontert utstyr — chargers, heat pumps, dimmer racks.
 *
 * Two things here are not obvious from the endpoint list.
 *
 * `channel_count` on a create is not a column. A four-channel Dynalite is
 * four rows nobody wants to add one at a time, so the create makes them.
 *
 * The delete takes the channels with it, and that pairing is what made
 * this endpoint answer 500 for the ordinary case in the Python version:
 * nothing declared the cascade, so it tried to orphan the channels against
 * a NOT NULL column. It is the same mistake that made deleting a populated
 * panel fail, found separately, months apart.
 */

import { Hono } from "hono";
import { and, eq } from "drizzle-orm";

import * as s from "../schema";
import type { Env } from "../context";
import type { Tenant } from "../db";
import { fail, intParam, intQuery } from "../http";
import {
  CHANNEL_CREATE_NESTED,
  EQUIPMENT_CREATE,
  EQUIPMENT_LABELS,
  EQUIPMENT_UPDATE,
  type ChannelType,
  type EquipmentType,
  channelRead,
  equipmentRead,
  fileRead,
} from "../schemas";
import { readBody } from "../validate";
import { readForm, storeUpload } from "./files";
import { entryOp } from "./log";
import { must } from "./lookup";

export const equipmentRoutes = new Hono<Env>();

const owned = (tenant: Tenant, id: number) =>
  must(tenant, s.equipment, id, "Equipment not found");
const idOf = (raw: string) => intParam(raw, "equipment_id");

const label = (type: string) => EQUIPMENT_LABELS[type] ?? type;

equipmentRoutes.get("/", async (c) => {
  const circuitId = intQuery(c.req.url, "circuit_id");
  const rows = await c
    .get("tenant")
    .list(s.equipment, circuitId === undefined ? undefined : eq(s.equipment.circuitId, circuitId));
  return c.json(rows.map(equipmentRead));
});

equipmentRoutes.post("/", async (c) => {
  const tenant = c.get("tenant");
  const body = await readBody(c.req.raw, EQUIPMENT_CREATE);
  const circuitId = body.circuit_id as number;

  await must(tenant, s.circuit, circuitId, "Circuit not found");
  return c.json(equipmentRead(await add(tenant, circuitId, body)));
});

/** Create under a circuit, with its channels and its log entry. Shared
 * with the nested route in ./circuits.ts. */
export async function add(
  tenant: Tenant,
  circuitId: number,
  body: Record<string, unknown>,
) {
  const item = await tenant.insert(s.equipment, {
    circuitId,
    type: body.type as EquipmentType,
    brand: body.brand as string | null,
    model: body.model as string | null,
    watt: body.watt as number | null,
    notes: body.notes as string | null,
  });

  const named = [item.brand, item.model].filter(Boolean).join(" ");
  const description =
    `Utstyr opprettet: ${label(item.type)}` + (named ? ` – ${named}` : "");

  const count = (body.channel_count as number | null) ?? 0;
  await tenant.atomically([
    entryOp(tenant, { circuitId }, description),
    ...Array.from({ length: count }, (_, i) =>
      tenant.op.insert(s.channel, { equipmentId: item.id, number: i + 1 }),
    ),
  ]);

  return item;
}

equipmentRoutes.get("/:equipment_id", async (c) =>
  c.json(equipmentRead(await owned(c.get("tenant"), idOf(c.req.param("equipment_id"))))),
);

equipmentRoutes.put("/:equipment_id", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("equipment_id"));
  await owned(tenant, id);

  const body = await readBody(c.req.raw, EQUIPMENT_UPDATE, { partial: true });
  const changes: Record<string, unknown> = {};
  if ("type" in body) changes.type = body.type;
  if ("brand" in body) changes.brand = body.brand;
  if ("model" in body) changes.model = body.model;
  if ("watt" in body) changes.watt = body.watt;
  if ("notes" in body) changes.notes = body.notes;

  return c.json(equipmentRead((await tenant.update(s.equipment, id, changes))!));
});

equipmentRoutes.delete("/:equipment_id", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("equipment_id"));
  const row = await owned(tenant, id);

  if (await tenant.exists(s.file, eq(s.file.equipmentId, id))) {
    throw fail(409, "Cannot delete equipment that has files");
  }

  await tenant.atomically([
    tenant.op.removeWhere(s.changelog, eq(s.changelog.equipmentId, id)),
    // Channels are equipment detail, not standalone records.
    tenant.op.removeWhere(s.channel, eq(s.channel.equipmentId, id)),
    tenant.op.remove(s.equipment, id),
    entryOp(tenant, { circuitId: row.circuitId }, `Utstyr slettet: ${label(row.type)}`),
  ]);

  return c.json(equipmentRead(row));
});

// --- Nested channels -------------------------------------------------------

equipmentRoutes.get("/:equipment_id/channels", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("equipment_id"));
  await owned(tenant, id);

  const rows = await tenant.list(
    s.channel,
    eq(s.channel.equipmentId, id),
    s.channel.number.getSQL(),
  );
  return c.json(rows.map(channelRead));
});

equipmentRoutes.post("/:equipment_id/channels", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("equipment_id"));
  await owned(tenant, id);

  const body = await readBody(c.req.raw, CHANNEL_CREATE_NESTED);
  const number = body.number as number;

  const duplicate = await tenant.exists(
    s.channel,
    and(eq(s.channel.equipmentId, id), eq(s.channel.number, number)),
  );
  if (duplicate) {
    throw fail(400, "Channel number already used for this equipment");
  }

  // A channel may serve a circuit other than the one its equipment hangs
  // off, so this is a real reference — and it has to be one of ours.
  const circuitId = body.circuit_id as number | null;
  if (circuitId !== null && !(await tenant.find(s.circuit, circuitId))) {
    throw fail(404, "Circuit not found");
  }

  const row = await tenant.insert(s.channel, {
    equipmentId: id,
    number,
    label: body.label as string | null,
    load: body.load as string | null,
    circuitId,
    notes: body.notes as string | null,
    channelType: body.channel_type as ChannelType,
    watt: body.watt as number | null,
  });
  return c.json(channelRead(row));
});

// --- Nested files ----------------------------------------------------------

equipmentRoutes.get("/:equipment_id/files", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("equipment_id"));
  await owned(tenant, id);
  return c.json((await tenant.list(s.file, eq(s.file.equipmentId, id))).map(fileRead));
});

equipmentRoutes.post("/:equipment_id/files", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("equipment_id"));
  await owned(tenant, id);

  const form = await readForm(c.req.raw);
  const row = await storeUpload(c.env, tenant, form, { equipmentId: id });
  return c.json(fileRead(row));
});
