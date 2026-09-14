/**
 * Modultyper — what a module in the panel drawing can be.
 *
 * The interesting behaviour is copy-on-write. Eight built-in types are
 * shared by every tenant and carry no organization. Editing one in place
 * would change the colour of everybody's automatsikring, so an edit makes
 * this organization its own version instead: same key, shadowing the
 * shared one, and deleting it later reverts to the default.
 *
 * That shadowing is why the listing is assembled rather than selected. A
 * customised built-in must appear once, not twice.
 *
 * Nothing here touches a table directly. The definitions come from
 * src/moduleTypes.ts, which is the one module allowed to work unscoped
 * because this is the one table that crosses tenants by design; the usage
 * counts come through Tenant, because modules do not.
 */

import { Hono } from "hono";

import * as s from "../schema";
import type { Env } from "../context";
import type { Tenant } from "../db";
import { fail, intParam } from "../http";
import * as types from "../moduleTypes";
import { MODULE_TYPE_CREATE, MODULE_TYPE_UPDATE, moduleTypeRead } from "../schemas";
import { readBody } from "../validate";

export const moduleTypeRoutes = new Hono<Env>();

/** How many of this organization's modules use each type. */
const usage = (tenant: Tenant) => tenant.countBy(s.module, s.module.type);

moduleTypeRoutes.get("/", async (c) => {
  const tenant = c.get("tenant");
  const [rows, counts] = await Promise.all([
    types.visible(c.env, tenant.organizationId),
    usage(tenant),
  ]);

  // Built-ins first, then the organization's own, each group by name. A
  // customised built-in keeps is_builtin and sorts with the standard ones,
  // which is where the user expects to find it.
  const listed = rows
    .map((row) => moduleTypeRead(row, counts.get(row.key) ?? 0))
    .sort((a, b) =>
      a.is_builtin === b.is_builtin
        ? a.name_no.localeCompare(b.name_no)
        : a.is_builtin
          ? -1
          : 1,
    );

  return c.json(listed);
});

moduleTypeRoutes.post("/", async (c) => {
  const tenant = c.get("tenant");
  const body = await readBody(c.req.raw, MODULE_TYPE_CREATE);
  const key = body.key as string;

  // Unique among what this organization can see, which includes the shared
  // built-ins — two types with one key would make the panel drawing depend
  // on which row a lookup happened to find.
  const existing = await types.visible(c.env, tenant.organizationId);
  if (existing.some((row) => row.key === key)) {
    throw fail(400, "Module type key already exists");
  }

  const row = await types.create(c.env, tenant.organizationId, {
    key,
    nameNo: body.name_no as string,
    color: body.color as string,
    abbreviation: body.abbreviation as string,
    canHaveCircuit: body.can_have_circuit as boolean,
    canHaveAmpere: body.can_have_ampere as boolean,
    isBuiltin: false,
  });

  return c.json(moduleTypeRead(row, (await usage(tenant)).get(key) ?? 0));
});

moduleTypeRoutes.get("/:type_id", async (c) => {
  const tenant = c.get("tenant");
  const row = await visibleOr404(c.env, tenant, c.req.param("type_id"));
  return c.json(moduleTypeRead(row, (await usage(tenant)).get(row.key) ?? 0));
});

moduleTypeRoutes.put("/:type_id", async (c) => {
  const tenant = c.get("tenant");
  const row = await visibleOr404(c.env, tenant, c.req.param("type_id"));
  const body = await readBody(c.req.raw, MODULE_TYPE_UPDATE, { partial: true });

  const changes: Record<string, unknown> = {};
  if ("name_no" in body) changes.nameNo = body.name_no;
  if ("color" in body) changes.color = body.color;
  if ("abbreviation" in body) changes.abbreviation = body.abbreviation;
  if ("can_have_circuit" in body) changes.canHaveCircuit = body.can_have_circuit;
  if ("can_have_ampere" in body) changes.canHaveAmpere = body.can_have_ampere;

  const updated =
    row.organizationId === null
      ? await types.replaceBuiltin(c.env, tenant.organizationId, row, changes)
      : await types.patch(c.env, row.id, changes);

  return c.json(moduleTypeRead(updated, (await usage(tenant)).get(updated.key) ?? 0));
});

moduleTypeRoutes.delete("/:type_id", async (c) => {
  const tenant = c.get("tenant");
  const row = await visibleOr404(c.env, tenant, c.req.param("type_id"));

  if (row.organizationId === null) {
    throw fail(409, "Built-in types cannot be deleted");
  }

  const count = (await usage(tenant)).get(row.key) ?? 0;
  if (count > 0) {
    // The modules would keep their type string and render as blanks with
    // no way to tell why.
    throw fail(409, `Cannot delete: ${count} module(s) use this type`);
  }

  await types.remove(c.env, row.id);
  return c.json(moduleTypeRead(row, 0));
});

/**
 * Usage by key rather than by id.
 *
 * The panel view asks "may I retire this" before offering the option, and
 * it knows the key, not which row backs it for this organization.
 */
moduleTypeRoutes.get("/:key/usage", async (c) => {
  const key = c.req.param("key");
  const counts = await usage(c.get("tenant"));
  return c.json({ key, count: counts.get(key) ?? 0 });
});

async function visibleOr404(
  env: Env["Bindings"],
  tenant: Tenant,
  raw: string,
): Promise<types.ModuleType> {
  const id = intParam(raw, "type_id");
  const row = await types.findVisible(env, tenant.organizationId, id);
  if (!row) throw fail(404, "Module type not found");
  return row;
}
