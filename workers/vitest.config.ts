import { defineConfig } from "vitest/config";

/**
 * The node project: questions about SQL, and about the rules this codebase
 * enforces on itself. tests/worker/ is excluded because it needs the real
 * runtime — see vitest.workers.config.ts.
 */
export default defineConfig({
  test: {
    include: ["tests/*.test.ts"],
  },
});
