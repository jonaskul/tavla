/**
 * Module type definitions.
 *
 * The one table that is deliberately not tenant-scoped. Built-in types —
 * breaker, rcd, dynalite and the rest — carry organization_id NULL and are
 * shared by everyone; a tenant may also define its own. So `Tenant` refuses
 * this table outright, and reads go through here instead, which is why this
 * file is named in tests/architecture.test.ts.
 *
 * The built-ins themselves are written by migration 0001 rather than by
 * code. A Worker has no startup to hang seeding off, and checking "are they
 * there yet" per request would be a query in every panel view.
 *
 * Everything here is a database call. The endpoints live in
 * routes/moduleTypes.ts, which touches no table — the same split as
 * auth.ts and routes/auth.ts, and for the same reason: the exception to
 * tenant scoping should be one file, not spread across the routes that
 * use it.
 */

import { and, eq, isNull, or } from "drizzle-orm";

import * as s from "./schema";
import { connect, unscoped } from "./db";
import type { Bindings } from "./config";

export type ModuleType = typeof s.moduleTypeDefinition.$inferSelect;

/**
 * The type this organization means by `key`, or null.
 *
 * Its own definition wins over the shared built-in of the same name. That
 * is what makes a customised type a customisation rather than a second row
 * that never gets read — the Python version ordered by nothing here and
 * would have found the built-in, which is a latent bug rather than a
 * decision, so it is not carried over.
 */
export async function findByKey(
  env: Bindings,
  organizationId: number,
  key: string,
): Promise<ModuleType | null> {
  const rows = await unscoped(connect(env))
    .select()
    .from(s.moduleTypeDefinition)
    .where(
      and(
        eq(s.moduleTypeDefinition.key, key),
        or(
          eq(s.moduleTypeDefinition.organizationId, organizationId),
          isNull(s.moduleTypeDefinition.organizationId),
        ),
      ),
    )
    .all();

  return rows.find((row) => row.organizationId !== null) ?? rows[0] ?? null;
}

/**
 * What this organization can see: the shared built-ins, plus its own.
 *
 * Where it has customised a built-in, its version shadows the shared one
 * — same key, one entry. That is what makes the customisation a
 * customisation rather than a duplicate in the list. See `replaceBuiltin`.
 */
export async function visible(
  env: Bindings,
  organizationId: number,
): Promise<ModuleType[]> {
  const rows = await unscoped(connect(env))
    .select()
    .from(s.moduleTypeDefinition)
    .where(
      or(
        eq(s.moduleTypeDefinition.organizationId, organizationId),
        isNull(s.moduleTypeDefinition.organizationId),
      ),
    )
    .all();

  const byKey = new Map<string, ModuleType>();
  for (const row of rows) {
    if (!byKey.has(row.key) || row.organizationId !== null) byKey.set(row.key, row);
  }
  return [...byKey.values()];
}

/** One by id, if this organization is allowed to see it. */
export async function findVisible(
  env: Bindings,
  organizationId: number,
  id: number,
): Promise<ModuleType | null> {
  const row = await unscoped(connect(env))
    .select()
    .from(s.moduleTypeDefinition)
    .where(eq(s.moduleTypeDefinition.id, id))
    .get();

  if (!row) return null;
  if (row.organizationId !== null && row.organizationId !== organizationId) return null;
  return row;
}

export async function create(
  env: Bindings,
  organizationId: number,
  values: Omit<typeof s.moduleTypeDefinition.$inferInsert, "organizationId">,
): Promise<ModuleType> {
  const [row] = await unscoped(connect(env))
    .insert(s.moduleTypeDefinition)
    .values({ ...values, organizationId })
    .returning();
  return row;
}

export async function patch(
  env: Bindings,
  id: number,
  changes: Partial<typeof s.moduleTypeDefinition.$inferInsert>,
): Promise<ModuleType> {
  if (Object.keys(changes).length === 0) {
    const row = await unscoped(connect(env))
      .select()
      .from(s.moduleTypeDefinition)
      .where(eq(s.moduleTypeDefinition.id, id))
      .get();
    return row!;
  }
  const [row] = await unscoped(connect(env))
    .update(s.moduleTypeDefinition)
    .set(changes)
    .where(eq(s.moduleTypeDefinition.id, id))
    .returning();
  return row;
}

/**
 * Give this organization its own version of a shared built-in.
 *
 * Editing a built-in in place would change it for every tenant, which is
 * not a thing one customer gets to do. So the edit copies instead: the new
 * row carries the same key, shadows the shared one in `visible`, and
 * deleting it later reverts to the default.
 *
 * It keeps is_builtin true on purpose — it is still one of the standard
 * types, sorted with them, and the flag is what the listing sorts by.
 */
export async function replaceBuiltin(
  env: Bindings,
  organizationId: number,
  original: ModuleType,
  changes: Partial<typeof s.moduleTypeDefinition.$inferInsert>,
): Promise<ModuleType> {
  return create(env, organizationId, {
    key: original.key,
    isBuiltin: true,
    nameNo: original.nameNo,
    color: original.color,
    abbreviation: original.abbreviation,
    canHaveCircuit: original.canHaveCircuit,
    canHaveAmpere: original.canHaveAmpere,
    ...changes,
  });
}

export async function remove(env: Bindings, id: number): Promise<void> {
  await unscoped(connect(env))
    .delete(s.moduleTypeDefinition)
    .where(eq(s.moduleTypeDefinition.id, id));
}
