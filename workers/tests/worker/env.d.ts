/**
 * What `env` is inside these tests: the worker's own bindings, plus the
 * migrations the pool hands in.
 *
 * The pool types `env` as `Cloudflare.Env`, which wrangler would normally
 * generate. Declaring it here instead keeps it following src/config.ts —
 * one definition of what this worker is given, rather than a generated
 * copy to remember to regenerate.
 */

import type { D1Migration } from "@cloudflare/vitest-pool-workers";

import type { Bindings } from "../../src/config";

declare global {
  namespace Cloudflare {
    interface Env extends Bindings {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
