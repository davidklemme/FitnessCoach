import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { unlinkSync, existsSync } from "node:fs";
import * as schema from "./schema.js";

const TEST_DB = "./test-connection.db";

function cleanUp() {
  for (const suffix of ["", "-wal", "-shm"]) {
    const path = `${TEST_DB}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
}

describe("database connection", () => {
  afterEach(() => {
    cleanUp();
  });

  it("creates a SQLite database file", () => {
    const sqlite = new Database(TEST_DB);
    sqlite.close();
    expect(existsSync(TEST_DB)).toBe(true);
  });

  it("enables WAL journal mode", () => {
    const sqlite = new Database(TEST_DB);
    sqlite.pragma("journal_mode = WAL");
    const result = sqlite.pragma("journal_mode") as { journal_mode: string }[];
    expect(result[0].journal_mode).toBe("wal");
    sqlite.close();
  });

  it("enables foreign key enforcement", () => {
    const sqlite = new Database(TEST_DB);
    sqlite.pragma("foreign_keys = ON");
    const result = sqlite.pragma("foreign_keys") as {
      foreign_keys: number;
    }[];
    expect(result[0].foreign_keys).toBe(1);
    sqlite.close();
  });

  it("wraps with Drizzle ORM", () => {
    const sqlite = new Database(TEST_DB);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    const db = drizzle(sqlite, { schema });
    expect(db).toBeDefined();
    sqlite.close();
  });
});
