/**
 * Where a module may sit, and what it may be wired to.
 *
 * Shared between placing a module and moving one, because the two asked
 * the same questions in the Python version and answered them with two
 * separate pieces of code. They had already drifted: creation checked the
 * row was inside the panel, moving did not.
 *
 * The drift is preserved below rather than fixed, because it is visible in
 * the contract — creation answers 400 for a bad position, moving answers
 * 422 — and this rewrite changes the contract nowhere. Both are marked so
 * the difference reads as a decision instead of an accident.
 */

import { and, eq, ne } from "drizzle-orm";

import * as s from "../schema";
import type { Bindings } from "../config";
import type { Tenant } from "../db";
import { fail } from "../http";
import { findByKey } from "../moduleTypes";

/**
 * Does a module of this size at this spot touch one already there?
 *
 * Two spans overlap when each starts before the other ends. `except` is
 * the module being moved, which must not collide with where it currently
 * is.
 */
export async function occupied(
  tenant: Tenant,
  panelId: number,
  row: number,
  position: number,
  width: number,
  except?: number,
): Promise<boolean> {
  const where =
    except === undefined
      ? and(eq(s.module.panelId, panelId), eq(s.module.row, row))
      : and(
          eq(s.module.panelId, panelId),
          eq(s.module.row, row),
          ne(s.module.id, except),
        );

  const neighbours = await tenant.list(s.module, where);
  return neighbours.some(
    (m) => position < m.position + m.width && position + width > m.position,
  );
}

/**
 * May this module carry this circuit?
 *
 * Three ways for the answer to be no. Two are the Python version's: a
 * vacant slot is not wired to anything by definition, and a surge
 * protector has no circuit to speak of.
 *
 * The third is new. Nothing checked that the circuit existed, let alone
 * that it was the caller's — the foreign key would have caught a
 * nonexistent one as a 500, and a circuit belonging to another tenant
 * would have been stored without complaint. It is a small hole, since
 * reading the circuit back goes through Tenant and finds nothing, but a
 * cross-tenant reference should not be writable at all.
 */
export async function checkCircuit(
  env: Bindings,
  tenant: Tenant,
  type: string,
  isVacant: boolean,
  circuitId: number | null,
): Promise<void> {
  if (!circuitId) return;

  if (isVacant) {
    throw fail(400, "Vacant module cannot be assigned to a circuit");
  }

  const definition = await findByKey(env, tenant.organizationId, type);
  if (definition && !definition.canHaveCircuit) {
    throw fail(400, `Module type '${type}' cannot be assigned to a circuit`);
  }

  if (!(await tenant.find(s.circuit, circuitId))) {
    throw fail(404, "Circuit not found");
  }
}
