/**
 * Kanaler — the individual outputs of a piece of equipment.
 *
 * Only edit and delete: a channel is always created under its equipment,
 * which is where the number has to be unique.
 */

import { Hono } from "hono";

import * as s from "../schema";
import type { Env } from "../context";
import { fail, intParam } from "../http";
import { CHANNEL_UPDATE, type ChannelType, channelRead } from "../schemas";
import { readBody } from "../validate";
import { must } from "./lookup";

export const channelRoutes = new Hono<Env>();

const idOf = (raw: string) => intParam(raw, "channel_id");

channelRoutes.put("/:channel_id", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("channel_id"));
  await must(tenant, s.channel, id, "Channel not found");

  const body = await readBody(c.req.raw, CHANNEL_UPDATE, { partial: true });

  // Only when a circuit was actually named. Clearing it with an explicit
  // null is how the frontend unassigns a channel, and that is not a
  // lookup.
  if ("circuit_id" in body && body.circuit_id !== null) {
    if (!(await tenant.find(s.circuit, body.circuit_id as number))) {
      throw fail(404, "Circuit not found");
    }
  }

  const changes: Record<string, unknown> = {};
  if ("label" in body) changes.label = body.label;
  if ("load" in body) changes.load = body.load;
  if ("circuit_id" in body) changes.circuitId = body.circuit_id;
  if ("notes" in body) changes.notes = body.notes;
  if ("channel_type" in body) changes.channelType = body.channel_type as ChannelType;
  if ("watt" in body) changes.watt = body.watt;

  return c.json(channelRead((await tenant.update(s.channel, id, changes))!));
});

channelRoutes.delete("/:channel_id", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("channel_id"));
  const row = await must(tenant, s.channel, id, "Channel not found");

  await tenant.remove(s.channel, id);
  return c.json(channelRead(row));
});
