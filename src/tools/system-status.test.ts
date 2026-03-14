import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { unlinkSync, existsSync } from "node:fs";
import * as schema from "../db/schema.js";
import { systemStatus } from "./system-status.js";
import { log } from "../lib/logger.js";

const TEST_DB = "./test-system-status.db";
let sqlite: InstanceType<typeof Database>;
let testDb: ReturnType<typeof drizzle>;

function cleanUp() {
  for (const suffix of ["", "-wal", "-shm"]) {
    const path = `${TEST_DB}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
}

function insertLog(
  level: string,
  source: string,
  message: string,
  timestamp?: string
) {
  testDb
    .insert(schema.systemLogs)
    .values({
      timestamp: timestamp ?? new Date().toISOString(),
      level,
      source,
      message,
      metadataJson: null,
    })
    .run();
}

function parseResult(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text);
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

const deps = () => ({
  database: testDb,
  dbPath: TEST_DB,
  startTime: Date.now() - 120_000, // 2 minutes ago
});

describe("system_status", () => {
  it("returns zero error count when no errors logged", async () => {
    insertLog("info", "test", "all good");
    const result = await systemStatus(deps());
    const status = parseResult(result);
    expect(status.recentErrorCount).toBe(0);
  });

  it("counts only errors from the last hour", async () => {
    insertLog("error", "test", "recent error");
    const twoHoursAgo = new Date(Date.now() - 7_200_000).toISOString();
    insertLog("error", "test", "old error", twoHoursAgo);

    const result = await systemStatus(deps());
    const status = parseResult(result);
    expect(status.recentErrorCount).toBe(1);
  });

  it("returns last log entry when logs exist", async () => {
    insertLog("info", "source-a", "first message");
    insertLog("warn", "source-b", "second message");

    const result = await systemStatus(deps());
    const status = parseResult(result);
    expect(status.lastLogEntry.level).toBe("warn");
    expect(status.lastLogEntry.source).toBe("source-b");
    expect(status.lastLogEntry.message).toBe("second message");
  });

  it("omits lastLogEntry when no logs exist", async () => {
    const result = await systemStatus(deps());
    const status = parseResult(result);
    expect("lastLogEntry" in status).toBe(false);
  });

  it("returns DB file size as a positive number", async () => {
    const result = await systemStatus(deps());
    const status = parseResult(result);
    expect(status.dbSizeBytes).toBeGreaterThan(0);
  });

  it("omits dbSizeBytes when file is inaccessible", async () => {
    const result = await systemStatus({
      ...deps(),
      dbPath: "/nonexistent/db.sqlite",
    });
    const status = parseResult(result);
    expect("dbSizeBytes" in status).toBe(false);
  });

  it("does not count non-error levels as errors", async () => {
    insertLog("debug", "test", "debug msg");
    insertLog("info", "test", "info msg");
    insertLog("warn", "test", "warn msg");

    const result = await systemStatus(deps());
    const status = parseResult(result);
    expect(status.recentErrorCount).toBe(0);
  });

  it("returns uptime in minutes", async () => {
    const result = await systemStatus(deps());
    const status = parseResult(result);
    expect(status.uptimeMinutes).toBe(2);
  });

  it("logs error before returning isError on failure", async () => {
    const closedSqlite = new Database(":memory:");
    const closedDb = drizzle(closedSqlite, { schema });
    closedSqlite.close();

    const result = await systemStatus({
      database: closedDb,
      dbPath: TEST_DB,
      startTime: Date.now(),
    });
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to retrieve");
  });
});
