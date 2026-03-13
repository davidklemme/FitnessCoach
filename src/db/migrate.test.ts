import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { unlinkSync, existsSync } from "node:fs";
import * as schema from "./schema.js";

const TEST_DB = "./test-migrate.db";

function cleanUp() {
  for (const suffix of ["", "-wal", "-shm"]) {
    const path = `${TEST_DB}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
}

function createTestDb() {
  const sqlite = new Database(TEST_DB);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

describe("migration infrastructure", () => {
  afterEach(() => {
    cleanUp();
  });

  it("applies migrations to a fresh database", () => {
    const { sqlite, db } = createTestDb();
    migrate(db, { migrationsFolder: "./drizzle/migrations" });

    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'"
      )
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("system_logs");
    sqlite.close();
  });

  it("creates system_logs with correct columns", () => {
    const { sqlite, db } = createTestDb();
    migrate(db, { migrationsFolder: "./drizzle/migrations" });

    const columns = sqlite.prepare("PRAGMA table_info(system_logs)").all() as {
      name: string;
      type: string;
      notnull: number;
    }[];

    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toEqual([
      "id",
      "timestamp",
      "level",
      "source",
      "message",
      "metadata_json",
    ]);

    const notNullColumns = columns
      .filter((c) => c.notnull === 1)
      .map((c) => c.name);
    expect(notNullColumns).toContain("timestamp");
    expect(notNullColumns).toContain("level");
    expect(notNullColumns).toContain("source");
    expect(notNullColumns).toContain("message");
    expect(notNullColumns).not.toContain("metadata_json");

    sqlite.close();
  });

  it("is idempotent — running migrations twice does not error", () => {
    const { sqlite, db } = createTestDb();
    migrate(db, { migrationsFolder: "./drizzle/migrations" });
    migrate(db, { migrationsFolder: "./drizzle/migrations" });

    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'"
      )
      .all() as { name: string }[];

    expect(tables.map((t) => t.name)).toContain("system_logs");
    sqlite.close();
  });
});
