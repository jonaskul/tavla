/**
 * The second test project: the worker itself, in workerd, against D1.
 *
 * tests/*.test.ts run in node against better-sqlite3, which is the right
 * environment for asking what SQL a query builder produces. It is the
 * wrong one for asking whether sign-in works: cookies, WebCrypto, fetch
 * and D1's own quirks are all runtime, and a node approximation of them
 * would let the rewrite pass while the deploy fails.
 *
 * So these run in the real runtime, with migrations applied to a real
 * local D1. Slower, and worth it for exactly the flow where being wrong is
 * expensive.
 */

import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

const migrations = await readD1Migrations("./migrations");

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          // Fixed, so a code issued in one request can be verified by the
          // next rather than depending on which isolate served it.
          SESSION_SECRET: "test-hemmelighet",
          // The test client speaks http, so a Secure cookie would never
          // come back. The flag is right; the transport in tests is not.
          COOKIE_SECURE: "0",
        },
      },
    }),
  ],
  test: {
    include: ["tests/worker/**/*.test.ts"],
    setupFiles: ["./tests/worker/setup.ts"],
  },
});
