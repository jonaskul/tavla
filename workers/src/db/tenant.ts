/**
 * The tenant boundary.
 *
 * On PostgreSQL the database itself refused to return another customer's
 * rows, even to a query that forgot its filter. D1 has no row-level
 * security, so this file is the only thing standing between two tenants.
 * That changes what it has to be: not a helper that makes scoping
 * convenient, but a surface where an unscoped query cannot be expressed.
 *
 * The distinction matters because "remember to add the filter" has already
 * failed twice in this codebase, in the Python version, on a far easier
 * problem. delete_panel guarded against circuits and forgot modules;
 * delete_circuit guarded against connection points and forgot equipment.
 * Three of five sites correct, two silently wrong. As 500s those were
 * irritating. Applied to tenant scoping, the same slip is one customer
 * reading another's documentation.
 *
 * So route handlers never receive a database handle. They receive a
 * Tenant, whose every method scopes. The raw handle exists in exactly two
 * places — here, and the authentication lookup, which by definition runs
 * before a tenant is known and is marked `unscoped` so it is greppable.
 */

import { and, eq, SQL, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

import * as schema from "../schema";

type Db = DrizzleD1Database<typeof schema>;

/** A table whose every row belongs to exactly one organization. */
export type TenantTable = (typeof schema.TENANT_TABLES)[number];

const TENANT_TABLE_SET: ReadonlySet<unknown> = new Set(schema.TENANT_TABLES);

export class NotScopedError extends Error {}

/**
 * A database handle bound to one organization.
 *
 * Every read is filtered and every write is stamped, by construction. There
 * is no method that takes "all rows" as an option.
 */
export class Tenant {
  constructor(
    private readonly db: Db,
    readonly organizationId: number,
  ) {
    if (!Number.isInteger(organizationId) || organizationId <= 0) {
      // Fail loudly rather than quietly scoping to undefined, which in SQL
      // compares as NULL and silently matches nothing — or, worse, is
      // coerced somewhere and matches something.
      throw new NotScopedError(
        `Ugyldig organisasjon: ${String(organizationId)}`,
      );
    }
  }

  /** The tenant filter, and'ed with whatever the caller asked for. */
  private scoped<T extends TenantTable>(table: T, extra?: SQL): SQL {
    if (!TENANT_TABLE_SET.has(table)) {
      // A table without organization_id cannot be reached through here at
      // all. Adding one to the schema and forgetting the column shows up
      // as this error rather than as an unfiltered query.
      throw new NotScopedError(
        "Tabellen er ikke tenant-scopet; bruk unscoped() bevisst hvis det er riktig",
      );
    }
    const mine = eq(
      (table as unknown as { organizationId: never }).organizationId,
      this.organizationId as never,
    );
    return extra ? (and(mine, extra) as SQL) : mine;
  }

  async list<T extends TenantTable>(
    table: T,
    where?: SQL,
    orderBy?: SQL,
  ): Promise<T["$inferSelect"][]> {
    const q = this.db.select().from(table as SQLiteTable).where(this.scoped(table, where));
    return (orderBy ? q.orderBy(orderBy) : q).all() as Promise<T["$inferSelect"][]>;
  }

  /** One row by id, or null — including when it belongs to someone else.
   *
   * Null rather than an error on purpose: a handler turns it into 404, so
   * another tenant cannot learn that an id exists by the shape of the
   * refusal.
   */
  async find<T extends TenantTable>(
    table: T,
    id: number,
  ): Promise<T["$inferSelect"] | null> {
    const row = await this.db
      .select()
      .from(table as SQLiteTable)
      .where(this.scoped(table, eq((table as unknown as { id: never }).id, id as never)))
      .get();
    return (row ?? null) as T["$inferSelect"] | null;
  }

  async first<T extends TenantTable>(
    table: T,
    where?: SQL,
  ): Promise<T["$inferSelect"] | null> {
    const row = await this.db
      .select()
      .from(table as SQLiteTable)
      .where(this.scoped(table, where))
      .get();
    return (row ?? null) as T["$inferSelect"] | null;
  }

  async exists<T extends TenantTable>(table: T, where?: SQL): Promise<boolean> {
    return (await this.first(table, where)) !== null;
  }

  async count<T extends TenantTable>(table: T, where?: SQL): Promise<number> {
    const row = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(table as SQLiteTable)
      .where(this.scoped(table, where))
      .get();
    return Number(row?.n ?? 0);
  }

  /**
   * How many rows carry each value of one column, scoped.
   *
   * For the module-type listing, which needs a usage count per type. The
   * alternative was reading every module and counting in JavaScript, or a
   * query per type — one is wasteful and the other is worse.
   */
  async countBy<T extends TenantTable>(
    table: T,
    column: SQLiteColumn,
    where?: SQL,
  ): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ value: column, n: sql<number>`count(*)` })
      .from(table as SQLiteTable)
      .where(this.scoped(table, where))
      .groupBy(column)
      .all();
    return new Map(rows.map((row) => [String(row.value), Number(row.n)]));
  }

  /** Insert, stamping the organization.
   *
   * organizationId is stripped from the caller's values first, so a handler
   * cannot write into another tenant even by passing one explicitly —
   * whether by mistake or because a request body reached this far.
   */
  async insert<T extends TenantTable>(
    table: T,
    values: Omit<T["$inferInsert"], "organizationId">,
  ): Promise<T["$inferSelect"]> {
    const { organizationId: _ignored, ...rest } = values as Record<string, unknown>;
    const [row] = await this.db
      .insert(table as SQLiteTable)
      .values({ ...rest, organizationId: this.organizationId } as never)
      .returning();
    return row as T["$inferSelect"];
  }

  /** Update by id. Returns null if the row is missing or not ours. */
  async update<T extends TenantTable>(
    table: T,
    id: number,
    values: Partial<Omit<T["$inferInsert"], "organizationId" | "id">>,
  ): Promise<T["$inferSelect"] | null> {
    const { organizationId: _ignored, id: _id, ...rest } = values as Record<string, unknown>;
    if (Object.keys(rest).length === 0) return this.find(table, id);

    const [row] = await this.db
      .update(table as SQLiteTable)
      .set(rest as never)
      .where(this.scoped(table, eq((table as unknown as { id: never }).id, id as never)))
      .returning();
    return (row ?? null) as T["$inferSelect"] | null;
  }

  /** Delete by id. False if the row was missing or not ours. */
  async remove<T extends TenantTable>(table: T, id: number): Promise<boolean> {
    const rows = await this.db
      .delete(table as SQLiteTable)
      .where(this.scoped(table, eq((table as unknown as { id: never }).id, id as never)))
      .returning();
    return rows.length > 0;
  }

  /** Delete everything matching, scoped. Used where a parent owns its
   * children outright — a panel's modules, an equipment's channels. */
  async removeWhere<T extends TenantTable>(table: T, where: SQL): Promise<number> {
    const rows = await this.db
      .delete(table as SQLiteTable)
      .where(this.scoped(table, where))
      .returning();
    return rows.length;
  }

  /** Update everything matching, scoped. Used to clear references when a
   * parent goes away — a module pointing at a deleted circuit. */
  async updateWhere<T extends TenantTable>(
    table: T,
    where: SQL,
    values: Partial<Omit<T["$inferInsert"], "organizationId" | "id">>,
  ): Promise<number> {
    const { organizationId: _ignored, ...rest } = values as Record<string, unknown>;
    const rows = await this.db
      .update(table as SQLiteTable)
      .set(rest as never)
      .where(this.scoped(table, where))
      .returning();
    return rows.length;
  }

  /**
   * Several writes, all or nothing.
   *
   * D1 refuses interactive transactions — BEGIN is rejected outright — but
   * batch() is atomic: a batch that fails leaves nothing behind. Verified
   * against local D1 before this was designed around.
   *
   * The statements come from `op` below, which scopes exactly as the
   * methods above do. That is the whole point of the split: deleting a
   * panel means deleting its modules too, and a batch built from raw
   * Drizzle would be the one place in the codebase where the tenant filter
   * is written by hand.
   */
  async atomically(statements: BatchItem<"sqlite">[]): Promise<unknown> {
    if (statements.length === 0) return [];
    // D1's batch signature insists on a non-empty tuple; the guard above is
    // what actually makes that true.
    return this.db.batch(
      statements as unknown as Parameters<Db["batch"]>[0],
    );
  }

  /**
   * The same writes, built but not sent, for `atomically`.
   *
   * Each mirrors the method of the same name and shares its scoping, so
   * there is no second implementation to keep in step.
   */
  readonly op = {
    insert: <T extends TenantTable>(
      table: T,
      values: Omit<T["$inferInsert"], "organizationId">,
    ) => {
      const { organizationId: _ignored, ...rest } = values as Record<string, unknown>;
      return this.db
        .insert(table as SQLiteTable)
        .values({ ...rest, organizationId: this.organizationId } as never)
        .returning();
    },

    update: <T extends TenantTable>(
      table: T,
      id: number,
      values: Partial<Omit<T["$inferInsert"], "organizationId" | "id">>,
    ) => this.op.updateWhere(table, eq((table as unknown as { id: never }).id, id as never), values),

    updateWhere: <T extends TenantTable>(
      table: T,
      where: SQL,
      values: Partial<Omit<T["$inferInsert"], "organizationId" | "id">>,
    ) => {
      const { organizationId: _ignored, id: _id, ...rest } = values as Record<string, unknown>;
      return this.db
        .update(table as SQLiteTable)
        .set(rest as never)
        .where(this.scoped(table, where))
        .returning();
    },

    remove: <T extends TenantTable>(table: T, id: number) =>
      this.op.removeWhere(table, eq((table as unknown as { id: never }).id, id as never)),

    removeWhere: <T extends TenantTable>(table: T, where: SQL) =>
      this.db
        .delete(table as SQLiteTable)
        .where(this.scoped(table, where))
        .returning(),
  };
}

/**
 * The raw handle, deliberately named to stand out in a diff.
 *
 * Legitimate uses are the ones that happen before a tenant exists or that
 * cross tenants by design: looking up a session to find out who is calling,
 * reading the shared built-in module types, and provisioning an account on
 * first sign-in. tests/architecture.test.ts keeps the list of files allowed
 * to import this, so a fourth use has to be argued for rather than slipped
 * in.
 */
export function unscoped(db: Db): Db {
  return db;
}
