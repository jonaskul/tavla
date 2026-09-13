/**
 * The only place a database handle is constructed.
 *
 * Everything else receives a Tenant, which scopes. Keeping construction
 * here is what lets tests/architecture.test.ts state the rule as a check
 * rather than a hope: a handler cannot reach around the boundary because
 * it has nothing to reach with.
 */

import { drizzle } from "drizzle-orm/d1";

import * as schema from "../schema";
import { Tenant } from "./tenant";
import type { Bindings } from "../config";

// Re-exported so a handler needs one import for "what the worker is given".
export type { Bindings };

export type Db = ReturnType<typeof connect>;

export function connect(env: Bindings) {
  return drizzle(env.DB, { schema });
}

/** A handle bound to one organization. The only thing handlers should see. */
export function forOrganization(env: Bindings, organizationId: number): Tenant {
  return new Tenant(connect(env), organizationId);
}

export { Tenant, NotScopedError, unscoped } from "./tenant";
