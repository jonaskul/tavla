/**
 * Writing to the changelog.
 *
 * The log records work done, not only what someone typed into it: adding
 * a connection point or a piece of equipment writes an entry by itself.
 * That is the difference between a log and a notes field, and it is worth
 * one shared function rather than the same four lines in three routers.
 */

import * as s from "../schema";
import type { Tenant } from "../db";

export interface LogTarget {
  circuitId?: number | null;
  connectionPointId?: number | null;
  equipmentId?: number | null;
}

/** A statement, not a write: the callers batch it with what it describes. */
export function entryOp(tenant: Tenant, target: LogTarget, description: string) {
  return tenant.op.insert(s.changelog, {
    circuitId: target.circuitId ?? null,
    connectionPointId: target.connectionPointId ?? null,
    equipmentId: target.equipmentId ?? null,
    changedBy: "system",
    description,
  });
}
