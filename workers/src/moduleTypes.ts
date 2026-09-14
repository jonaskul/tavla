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
 * Session 6 adds the endpoints. This is only what placing a module needs:
 * does a type by this key exist, and may it be wired to a circuit.
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
