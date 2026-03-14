import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { unlinkSync, existsSync } from "node:fs";
import * as schema from "../db/schema.js";
import { log } from "./logger.js";

const TEST_DB = "./test-logger.db";
let sqlite: InstanceType<typeof Database>;
let testDb: ReturnType<typeof drizzle>;

function cleanUp() {
  for (const suffix of ["", "-wal", "-shm"]) {
    const path = `${TEST_DB}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
}

beforeAll(() => {
  cleanUp();
  sqlite = new Database(TEST_DB);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: "./drizzle/migrations" });
});

beforeEach(() => {
  testDb.delete(schema.systemLogs).run();
});

afterAll(() => {
  sqlite.close();
  cleanUp();
});

describe("logger", () => {
  it("inserts a log entry with all fields", () => {
    log("error", "test-source", "something broke", { key: "value" }, testDb);

    const rows = testDb.select().from(schema.systemLogs).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].level).toBe("error");
    expect(rows[0].source).toBe("test-source");
    expect(rows[0].message).toBe("something broke");
    expect(JSON.parse(rows[0].metadataJson!)).toEqual({ key: "value" });
    expect(rows[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("stores null metadata when none provided", () => {
    log("info", "test", "no metadata", undefined, testDb);

    const rows = testDb.select().from(schema.systemLogs).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].metadataJson).toBeNull();
  });

  it("supports all log levels", () => {
    for (const level of ["debug", "info", "warn", "error"] as const) {
      log(level, "test", `${level} message`, undefined, testDb);
    }

    const rows = testDb.select().from(schema.systemLogs).all();
    expect(rows).toHaveLength(4);
    const levels = rows.map((r) => r.level);
    expect(levels).toEqual(["debug", "info", "warn", "error"]);
  });

  it("auto-increments IDs", () => {
    log("info", "test", "first", undefined, testDb);
    log("info", "test", "second", undefined, testDb);

    const rows = testDb.select().from(schema.systemLogs).all();
    expect(rows[1].id).toBeGreaterThan(rows[0].id);
  });

  it("does not throw when DB write fails", () => {
    const closedSqlite = new Database(":memory:");
    const closedDb = drizzle(closedSqlite, { schema });
    closedSqlite.close();

    // Should not throw — logs to stderr instead
    expect(() =>
      log("error", "test", "should not crash", undefined, closedDb)
    ).not.toThrow();
  });
});
