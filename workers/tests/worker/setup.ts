import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, beforeEach } from "vitest";

// Applied once: the schema is the same for every test.
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

/**
 * An empty database before each test.
 *
 * This version of the pool has no per-test storage isolation, so without
 * it the tests share one database — and they would not merely interfere,
 * they would interfere invisibly. The first run showed how: login codes
 * left behind by earlier tests tripped the per-address rate limit, so a
 * dozen tests failed for a reason none of them was about.
 *
 * Derived from sqlite_master rather than a list, so a table added in a
 * later session is cleared without anyone remembering to add it here.
 * Order matters and cannot be derived from creation order: module
 * references both panel and circuit, and one of those is created after it.
 * D1 also refuses PRAGMA defer_foreign_keys, so the constraints cannot
 * simply be stood down. Deleting what will delete, repeatedly, gets there
 * without anyone maintaining a topological order by hand.
 */
/**
 * Rows that are schema, not test data.
 *
 * The built-in module types are written by migration 0001 and shared by
 * every tenant. Clearing them made every module in these tests answer
 * "Unknown module type: breaker" — a 422 that looked like a validation
 * bug and was really the fixture eating the seed.
 */
const KEEP: Record<string, string> = {
  moduletypedefinition: " where is_builtin = 0",
};

beforeEach(async () => {
  const { results } = await env.DB.prepare(
    "select name from sqlite_master where type = 'table' " +
      "and name not like 'sqlite_%' and name not like '\\_cf\\_%' escape '\\' " +
      "and name != 'd1_migrations'",
  ).all<{ name: string }>();

  let pending: string[] = results.map((row) => row.name);
  while (pending.length > 0) {
    const blocked: string[] = [];
    for (const name of pending) {
      try {
        await env.DB.prepare(`delete from "${name}"${KEEP[name] ?? ""}`).run();
      } catch {
        blocked.push(name); // a child still holds rows; next pass
      }
    }
    if (blocked.length === pending.length) {
      throw new Error(`Fikk ikke tømt: ${blocked.join(", ")}`);
    }
    pending = blocked;
  }
});
