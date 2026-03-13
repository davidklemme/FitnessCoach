import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { unlinkSync, existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { logSession, logSessionSchema } from "./log-session.js";
import type { LogSessionInput } from "./log-session.js";

const TEST_DB = "./test-log-session.db";
let sqlite: InstanceType<typeof Database>;
let testDb: ReturnType<typeof drizzle>;

function cleanUp() {
  for (const suffix of ["", "-wal", "-shm"]) {
    const path = `${TEST_DB}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
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

  testDb.delete(schema.exercises).run();
  testDb
    .insert(schema.exercises)
    .values([
      {
        id: 1,
        name: "Push-Up",
        locationType: "anywhere",
        equipmentRequired: JSON.stringify(["none"]),
        minDuration: 5,
        jointStressRating: 3,
        muscleGroups: JSON.stringify(["chest", "triceps"]),
      },
      {
        id: 2,
        name: "Pull-Up",
        locationType: "anywhere",
        equipmentRequired: JSON.stringify(["pull-up bar"]),
        minDuration: 10,
        jointStressRating: 4,
        muscleGroups: JSON.stringify(["lats", "biceps"]),
      },
      {
        id: 3,
        name: "Barbell Squat",
        locationType: "gym",
        equipmentRequired: JSON.stringify(["barbell", "squat rack"]),
        minDuration: 15,
        jointStressRating: 6,
        muscleGroups: JSON.stringify(["quads", "glutes"]),
      },
    ])
    .run();
});

beforeEach(() => {
  testDb.delete(schema.sessionLogEntries).run();
  testDb.delete(schema.sessionLogs).run();
  testDb.delete(schema.systemLogs).run();
});

afterAll(() => {
  sqlite.close();
  cleanUp();
});

const basicInput: LogSessionInput = {
  date: "2026-03-10",
  session_type: "push",
  session_order: 1,
  rpe: 7,
  prehab_completed: true,
  notes: "Felt good today",
  exercises: [
    { exercise_id: 1, sets: 4, reps: "12,12,10,8", weight: "bodyweight", rpe_per_exercise: 7 },
  ],
};

describe("log_session", () => {
  it("creates a session log with exercise entries", async () => {
    const result = await logSession(basicInput, testDb, sqlite);
    const data = parseResult(result);
    expect(data.sessionLogId).toBeDefined();
    expect(data.date).toBe("2026-03-10");
    expect(data.sessionType).toBe("push");
    expect(data.sessionOrder).toBe(1);
    expect(data.entryCount).toBe(1);
    expect(data.rpe).toBe(7);
    expect(data.prehabCompleted).toBe(true);

    // Verify DB state
    const logs = testDb.select().from(schema.sessionLogs).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].date).toBe("2026-03-10");
    expect(logs[0].prehabCompleted).toBe(true);

    const entries = testDb.select().from(schema.sessionLogEntries).all();
    expect(entries).toHaveLength(1);
    expect(entries[0].exerciseId).toBe(1);
    expect(entries[0].sets).toBe(4);
    expect(entries[0].reps).toBe("12,12,10,8");
    expect(entries[0].weight).toBe("bodyweight");
    expect(entries[0].rpePerExercise).toBe(7);
  });

  it("creates session with multiple exercise entries", async () => {
    const input: LogSessionInput = {
      ...basicInput,
      exercises: [
        { exercise_id: 1, sets: 4, reps: "12" },
        { exercise_id: 2, sets: 3, reps: "8" },
      ],
    };
    const result = await logSession(input, testDb, sqlite);
    const data = parseResult(result);
    expect(data.entryCount).toBe(2);

    const entries = testDb.select().from(schema.sessionLogEntries).all();
    expect(entries).toHaveLength(2);
  });

  it("upserts on duplicate (date, session_type, session_order) — NFR3", async () => {
    await logSession(basicInput, testDb, sqlite);

    // Log same session again with updated RPE and different exercises
    const updatedInput: LogSessionInput = {
      ...basicInput,
      rpe: 8,
      notes: "Updated notes",
      exercises: [
        { exercise_id: 1, sets: 5, reps: "10" },
        { exercise_id: 2, sets: 3, reps: "8" },
      ],
    };
    const result = await logSession(updatedInput, testDb, sqlite);
    const data = parseResult(result);
    expect(data.upserted).toBe(true);
    expect(data.entryCount).toBe(2);

    // Should still be one session log, not two
    const logs = testDb.select().from(schema.sessionLogs).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].rpe).toBe(8);
    expect(logs[0].notes).toBe("Updated notes");

    // Old entries replaced with new ones
    const entries = testDb.select().from(schema.sessionLogEntries).all();
    expect(entries).toHaveLength(2);
  });

  it("supports multiple sessions of same type on same day via session_order", async () => {
    await logSession(basicInput, testDb, sqlite);

    const secondSession: LogSessionInput = {
      ...basicInput,
      session_order: 2,
      notes: "Evening session",
    };
    await logSession(secondSession, testDb, sqlite);

    const logs = testDb.select().from(schema.sessionLogs).all();
    expect(logs).toHaveLength(2);
    expect(logs.map((l) => l.sessionOrder).sort()).toEqual([1, 2]);
  });

  it("omits optional fields from response when not provided", async () => {
    const minimalInput: LogSessionInput = {
      date: "2026-03-11",
      session_type: "pull",
      session_order: 1,
      exercises: [{ exercise_id: 2, sets: 3, reps: "8" }],
    };
    const result = await logSession(minimalInput, testDb, sqlite);
    const data = parseResult(result);
    expect("rpe" in data).toBe(false);
    expect("prehabCompleted" in data).toBe(false);
    expect("upserted" in data).toBe(false);
  });

  it("rejects invalid exercise ID with FK violation and rolls back", async () => {
    const input: LogSessionInput = {
      ...basicInput,
      exercises: [{ exercise_id: 999, sets: 3, reps: "10" }],
    };
    const result = await logSession(input, testDb, sqlite);
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to log session");

    // Verify transaction rolled back — no partial session_logs row
    const logs = testDb.select().from(schema.sessionLogs).all();
    expect(logs).toHaveLength(0);
  });

  it("returns isError on DB failure", async () => {
    const closedSqlite = new Database(":memory:");
    const closedDb = drizzle(closedSqlite, { schema });
    closedSqlite.close();

    const result = await logSession(basicInput, closedDb, closedSqlite);
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to log session");
  });

  it("normalizes session_type to trimmed lowercase", async () => {
    const input: LogSessionInput = {
      ...basicInput,
      session_type: "push",
    };
    // Parse through schema to trigger transform
    const parsed = logSessionSchema.parse({ ...input, session_type: " Push " });
    expect(parsed.session_type).toBe("push");

    const result = await logSession(input, testDb, sqlite);
    const data = parseResult(result);
    expect(data.sessionType).toBe("push");
  });
});

describe("logSessionSchema validation (AC 5)", () => {
  it("rejects missing date", () => {
    const result = logSessionSchema.safeParse({
      session_type: "push",
      exercises: [{ exercise_id: 1, sets: 3, reps: "8" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = logSessionSchema.safeParse({
      date: "March 10",
      session_type: "push",
      exercises: [{ exercise_id: 1, sets: 3, reps: "8" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("YYYY-MM-DD");
    }
  });

  it("rejects empty exercises array", () => {
    const result = logSessionSchema.safeParse({
      date: "2026-03-10",
      session_type: "push",
      exercises: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing exercises field", () => {
    const result = logSessionSchema.safeParse({
      date: "2026-03-10",
      session_type: "push",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing session_type", () => {
    const result = logSessionSchema.safeParse({
      date: "2026-03-10",
      exercises: [{ exercise_id: 1, sets: 3, reps: "8" }],
    });
    expect(result.success).toBe(false);
  });
});
