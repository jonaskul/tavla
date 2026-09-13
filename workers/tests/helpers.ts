/**
 * A real SQLite database built from the same migration D1 gets.
 *
 * Not a mock: the point of these tests is what the generated SQL does, and
 * a fake query builder would answer a different question. The Drizzle
 * dialect differs only in the driver.
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "../src/schema";

export function freshDb() {
  const sqlite = new Database(":memory:");
  const dir = path.join(import.meta.dirname, "..", "migrations");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const statements = fs
      .readFileSync(path.join(dir, file), "utf8")
      .split("--> statement-breakpoint");
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed) sqlite.exec(trimmed);
    }
  }
  return drizzle(sqlite, { schema });
}

export async function makeOrg(db: ReturnType<typeof freshDb>, name: string) {
  const [org] = await db.insert(schema.organization).values({ name }).returning();
  return org.id;
}
