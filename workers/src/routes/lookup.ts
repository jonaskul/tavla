/**
 * Fetch one row, or answer 404.
 *
 * Shared because the Norwegian for "get it or give up" is the same in
 * every router, and because the 404 has to mean two things at once:
 * the row is not there, and the row belongs to somebody else. `Tenant.find`
 * returns null for both, so a caller cannot tell them apart by the shape
 * of the refusal — which is the point, and is why this wrapper does not
 * try to be more informative.
 */

import type { Tenant, TenantTable } from "../db/tenant";
import { fail } from "../http";

export async function must<T extends TenantTable>(
  tenant: Tenant,
  table: T,
  id: number,
  missing: string,
): Promise<T["$inferSelect"]> {
  const row = await tenant.find(table, id);
  if (!row) throw fail(404, missing);
  return row;
}
