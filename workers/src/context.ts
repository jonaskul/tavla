/**
 * What a route handler is given.
 *
 * `tenant` rather than a database handle, always. A handler cannot write
 * an unscoped query because it has nothing to write one with — see
 * src/db/tenant.ts for why that is the shape rather than a convention.
 *
 * Its own module so the routes and the app that mounts them can share the
 * type without importing each other.
 */

import type { Hono } from "hono";

import type { Principal } from "./auth";
import type { Bindings } from "./config";
import type { Tenant } from "./db";

export interface Variables {
  principal: Principal;
  tenant: Tenant;
}

export type Env = { Bindings: Bindings; Variables: Variables };
export type App = Hono<Env>;
