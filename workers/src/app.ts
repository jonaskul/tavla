/**
 * The application: one guard, then the routes.
 *
 * The guard is the piece worth reading. It runs once, in front of
 * everything, rather than being declared per endpoint — because a create
 * endpoint that forgot to declare it would not fail loudly. It would write
 * a row with no organization, and surface as a 500 from a NOT NULL
 * violation rather than a 401. That exact mistake was made on the Python
 * side across seventeen endpoints before it was found.
 *
 * So the default is refusal, and the unauthenticated surface is the short
 * list below. A route added in a later session is protected because it
 * exists, not because someone remembered.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import * as auth from "./auth";
import { type Bindings, ConfigError } from "./config";
import { Tenant, forOrganization } from "./db";
import { authRoutes } from "./routes/auth";

export interface Variables {
  principal: auth.Principal;
  tenant: Tenant;
}

export type App = Hono<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Reachable without signing in.
 *
 * Each of these guards itself: request-code answers identically whatever
 * the address, verify is rate limited and constant time, logout is
 * idempotent, and me returns 401 on its own.
 */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  "/api/health",
  "/api/auth/request-code",
  "/api/auth/verify",
  "/api/auth/logout",
  "/api/auth/me",
]);

export function createApp(): App {
  const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

  app.use("*", async (c, next) => {
    if (PUBLIC_PATHS.has(new URL(c.req.url).pathname)) return next();

    const principal = await auth.principalFor(c.env, c.req.raw);
    const organizationId = await auth.resolveOrganization(c.env, principal, c.req.raw);

    // Not signed in, signed in with no membership, and asking to act as an
    // organization one does not belong to all land here. They are one
    // answer on purpose: "sees nothing" rather than three different hints.
    if (!principal || organizationId === null) {
      return c.json({ detail: "Ikke innlogget" }, 401);
    }

    c.set("principal", principal);
    c.set("tenant", forOrganization(c.env, organizationId));
    return next();
  });

  app.get("/api/health", (c) => c.json({ status: "ok" }));

  app.route("/api/auth", authRoutes);

  app.notFound((c) => c.json({ detail: "Not Found" }, 404));

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return error.getResponse();
    }
    if (error instanceof ConfigError) {
      // A deploy that is missing a secret. Loud in the log, opaque to the
      // caller — the message names an environment variable.
      console.error("Feil oppsett:", error.message);
      return c.json({ detail: "Tjeneren er feilkonfigurert" }, 500);
    }
    console.error("Ubehandlet feil:", error);
    return c.json({ detail: "Intern feil" }, 500);
  });

  return app;
}
