import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { unlinkSync, existsSync } from "node:fs";
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
  testDb.delete(schema.injuryStatusLog).run();
  testDb.delete(schema.healthObservations).run();
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

// ─── Story 3.1: Session Logging ─────────────────────────────────────────────

describe("log_session — session logging", () => {
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

    const logs = testDb.select().from(schema.sessionLogs).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].rpe).toBe(8);
    expect(logs[0].notes).toBe("Updated notes");

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
    expect("injuryLogId" in data).toBe(false);
    expect("healthObservationId" in data).toBe(false);
  });

  it("rejects invalid exercise ID with FK violation and rolls back", async () => {
    const input: LogSessionInput = {
      ...basicInput,
      exercises: [{ exercise_id: 999, sets: 3, reps: "10" }],
    };
    const result = await logSession(input, testDb, sqlite);
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to log session");

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
    const parsed = logSessionSchema.parse({ ...basicInput, session_type: " Push " });
    expect(parsed.session_type).toBe("push");
  });
});

// ─── Story 3.2: Injury Status & Ad-hoc Injury Logging ──────────────────────

describe("log_session — injury logging", () => {
  it("logs injury atomically with session (AC 3.2-2)", async () => {
    const input: LogSessionInput = {
      ...basicInput,
      injury: {
        pain_level: 4,
        location: "left shoulder",
        trigger_exercise_id: 1,
        severity: "moderate",
        affected_areas: ["chest", "shoulder"],
        escalation_stage: "reduce_volume",
        notes: "Felt sharp pain on last set",
      },
    };
    const result = await logSession(input, testDb, sqlite);
    const data = parseResult(result);

    expect(data.sessionLogId).toBeDefined();
    expect(data.entryCount).toBe(1);
    expect(data.injuryLogId).toBeDefined();
    expect(data.injuryPainLevel).toBe(4);
    expect(data.injuryLocation).toBe("left shoulder");

    const logs = testDb.select().from(schema.sessionLogs).all();
    expect(logs).toHaveLength(1);

    const injuries = testDb.select().from(schema.injuryStatusLog).all();
    expect(injuries).toHaveLength(1);
    expect(injuries[0].painLevel).toBe(4);
    expect(injuries[0].location).toBe("left shoulder");
    expect(injuries[0].triggerExerciseId).toBe(1);
    expect(injuries[0].severity).toBe("moderate");
    expect(JSON.parse(injuries[0].affectedAreasJson!)).toEqual(["chest", "shoulder"]);
    expect(injuries[0].escalationStage).toBe("reduce_volume");
    expect(injuries[0].notes).toBe("Felt sharp pain on last set");
  });

  it("logs ad-hoc injury without session record (AC 3.2-3)", async () => {
    const input: LogSessionInput = {
      date: "2026-03-12",
      session_type: "injury",
      session_order: 1,
      ad_hoc_injury: true,
      injury: {
        pain_level: 6,
        location: "right knee",
        severity: "moderate",
        affected_areas: ["quads", "knee"],
        escalation_stage: "low_impact_only",
      },
    };
    const result = await logSession(input, testDb, sqlite);
    const data = parseResult(result);

    expect(data.adHocInjury).toBe(true);
    expect(data.injuryLogId).toBeDefined();
    expect(data.injuryPainLevel).toBe(6);
    expect(data.injuryLocation).toBe("right knee");
    expect("sessionLogId" in data).toBe(false);
    expect("entryCount" in data).toBe(false);

    const logs = testDb.select().from(schema.sessionLogs).all();
    expect(logs).toHaveLength(0);

    const injuries = testDb.select().from(schema.injuryStatusLog).all();
    expect(injuries).toHaveLength(1);
  });

  it("rolls back both session and injury on FK violation", async () => {
    const input: LogSessionInput = {
      ...basicInput,
      exercises: [{ exercise_id: 999, sets: 3, reps: "10" }],
      injury: {
        pain_level: 3,
        location: "wrist",
      },
    };
    const result = await logSession(input, testDb, sqlite);
    expect((result as { isError?: boolean }).isError).toBe(true);

    const logs = testDb.select().from(schema.sessionLogs).all();
    expect(logs).toHaveLength(0);
    const injuries = testDb.select().from(schema.injuryStatusLog).all();
    expect(injuries).toHaveLength(0);
  });

  it("rejects invalid trigger_exercise_id FK in ad-hoc injury", async () => {
    const input: LogSessionInput = {
      date: "2026-03-12",
      session_type: "injury",
      session_order: 1,
      ad_hoc_injury: true,
      injury: {
        pain_level: 5,
        location: "elbow",
        trigger_exercise_id: 999,
      },
    };
    const result = await logSession(input, testDb, sqlite);
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to log session");
  });

  it("allows multiple injury logs on the same date", async () => {
    const injury1: LogSessionInput = {
      date: "2026-03-12",
      session_type: "injury",
      session_order: 1,
      ad_hoc_injury: true,
      injury: { pain_level: 3, location: "left shoulder" },
    };
    const injury2: LogSessionInput = {
      date: "2026-03-12",
      session_type: "injury",
      session_order: 1,
      ad_hoc_injury: true,
      injury: { pain_level: 5, location: "right knee" },
    };
    await logSession(injury1, testDb, sqlite);
    await logSession(injury2, testDb, sqlite);

    const injuries = testDb.select().from(schema.injuryStatusLog).all();
    expect(injuries).toHaveLength(2);
  });
});

// ─── Story 3.3: Health Observations ─────────────────────────────────────────

describe("log_session — health observations", () => {
  it("logs health observations with session (AC 3.3-5)", async () => {
    const input: LogSessionInput = {
      ...basicInput,
      health: {
        sleep_quality: 4,
        energy_level: 3,
        soreness_level: 2,
        notes: "Slept well, a bit sore from yesterday",
      },
    };
    const result = await logSession(input, testDb, sqlite);
    const data = parseResult(result);

    expect(data.sessionLogId).toBeDefined();
    expect(data.healthObservationId).toBeDefined();

    const health = testDb.select().from(schema.healthObservations).all();
    expect(health).toHaveLength(1);
    expect(health[0].date).toBe("2026-03-10");
    expect(health[0].sleepQuality).toBe(4);
    expect(health[0].energyLevel).toBe(3);
    expect(health[0].sorenessLevel).toBe(2);
    expect(health[0].notes).toBe("Slept well, a bit sore from yesterday");
  });

  it("logs health-only for rest days (no session record)", async () => {
    const input: LogSessionInput = {
      date: "2026-03-13",
      session_type: "rest",
      session_order: 1,
      health: {
        sleep_quality: 5,
        energy_level: 4,
        soreness_level: 1,
      },
    };
    const result = await logSession(input, testDb, sqlite);
    const data = parseResult(result);

    expect(data.healthOnly).toBe(true);
    expect(data.healthObservationId).toBeDefined();
    expect("sessionLogId" in data).toBe(false);
    expect("entryCount" in data).toBe(false);

    const logs = testDb.select().from(schema.sessionLogs).all();
    expect(logs).toHaveLength(0);

    const health = testDb.select().from(schema.healthObservations).all();
    expect(health).toHaveLength(1);
  });

  it("upserts health observations on same date", async () => {
    const input1: LogSessionInput = {
      date: "2026-03-13",
      session_type: "rest",
      session_order: 1,
      health: { sleep_quality: 3, energy_level: 2, soreness_level: 4 },
    };
    await logSession(input1, testDb, sqlite);

    const input2: LogSessionInput = {
      date: "2026-03-13",
      session_type: "rest",
      session_order: 1,
      health: { sleep_quality: 4, energy_level: 3, soreness_level: 2 },
    };
    const result = await logSession(input2, testDb, sqlite);
    const data = parseResult(result);
    expect(data.healthObservationId).toBeDefined();

    const health = testDb.select().from(schema.healthObservations).all();
    expect(health).toHaveLength(1);
    expect(health[0].sleepQuality).toBe(4);
    expect(health[0].energyLevel).toBe(3);
    expect(health[0].sorenessLevel).toBe(2);
  });

  it("combines session + injury + health in one call", async () => {
    const input: LogSessionInput = {
      ...basicInput,
      injury: {
        pain_level: 2,
        location: "left wrist",
        escalation_stage: "monitor",
      },
      health: {
        sleep_quality: 3,
        energy_level: 3,
        soreness_level: 3,
      },
    };
    const result = await logSession(input, testDb, sqlite);
    const data = parseResult(result);

    expect(data.sessionLogId).toBeDefined();
    expect(data.entryCount).toBe(1);
    expect(data.injuryLogId).toBeDefined();
    expect(data.healthObservationId).toBeDefined();

    expect(testDb.select().from(schema.sessionLogs).all()).toHaveLength(1);
    expect(testDb.select().from(schema.sessionLogEntries).all()).toHaveLength(1);
    expect(testDb.select().from(schema.injuryStatusLog).all()).toHaveLength(1);
    expect(testDb.select().from(schema.healthObservations).all()).toHaveLength(1);
  });
});

// ─── Schema Validation (AC 3.1-5, AC 3.2-4) ────────────────────────────────

describe("logSessionSchema validation", () => {
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

  it("rejects missing session_type", () => {
    const result = logSessionSchema.safeParse({
      date: "2026-03-10",
      exercises: [{ exercise_id: 1, sets: 3, reps: "8" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects pain_level outside 0-10 (AC 3.2-4)", () => {
    const tooHigh = logSessionSchema.safeParse({
      date: "2026-03-10",
      session_type: "injury",
      ad_hoc_injury: true,
      injury: { pain_level: 11, location: "knee" },
    });
    expect(tooHigh.success).toBe(false);

    const tooLow = logSessionSchema.safeParse({
      date: "2026-03-10",
      session_type: "injury",
      ad_hoc_injury: true,
      injury: { pain_level: -1, location: "knee" },
    });
    expect(tooLow.success).toBe(false);
  });

  it("rejects ad_hoc_injury without injury data", () => {
    const result = logSessionSchema.safeParse({
      date: "2026-03-10",
      session_type: "injury",
      ad_hoc_injury: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects no exercises, no injury, no health (nothing to do)", () => {
    const result = logSessionSchema.safeParse({
      date: "2026-03-10",
      session_type: "push",
    });
    expect(result.success).toBe(false);
  });

  it("rejects health observation values outside 1-5", () => {
    const result = logSessionSchema.safeParse({
      date: "2026-03-10",
      session_type: "rest",
      health: { sleep_quality: 6 },
    });
    expect(result.success).toBe(false);
  });

  it("accepts pain_level 0 (no pain)", () => {
    const result = logSessionSchema.safeParse({
      date: "2026-03-10",
      session_type: "injury",
      ad_hoc_injury: true,
      injury: { pain_level: 0, location: "left shoulder" },
    });
    expect(result.success).toBe(true);
  });
});
