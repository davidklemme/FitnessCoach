import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { unlinkSync, existsSync } from "node:fs";
import * as schema from "../db/schema.js";
import { checkIn } from "./check-in.js";
import { logSession } from "./log-session.js";
import type { LogSessionInput } from "./log-session.js";
import { updatePlan } from "./update-plan.js";

const TEST_DB = "./test-check-in.db";
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
        id: 1, name: "Push-Up", locationType: "anywhere",
        equipmentRequired: JSON.stringify(["none"]),
        minDuration: 5, jointStressRating: 3,
        muscleGroups: JSON.stringify(["chest", "triceps"]),
      },
      {
        id: 2, name: "Pull-Up", locationType: "anywhere",
        equipmentRequired: JSON.stringify(["pull-up bar"]),
        minDuration: 10, jointStressRating: 4,
        muscleGroups: JSON.stringify(["lats", "biceps"]),
      },
    ])
    .run();
});

beforeEach(() => {
  testDb.delete(schema.sessionLogEntries).run();
  testDb.delete(schema.sessionLogs).run();
  testDb.delete(schema.injuryStatusLog).run();
  testDb.delete(schema.healthObservations).run();
  testDb.delete(schema.planSessionExercises).run();
  testDb.delete(schema.planSessions).run();
  testDb.delete(schema.plans).run();
  testDb.delete(schema.benchmarks).run();
  testDb.delete(schema.systemLogs).run();
});

afterAll(() => {
  sqlite.close();
  cleanUp();
});

describe("check_in — empty state", () => {
  it("returns actionable message when no data exists", async () => {
    const result = await checkIn(testDb);
    const data = parseResult(result);
    expect(data.message).toContain("No data available");
  });
});

describe("check_in — injury status", () => {
  it("returns injury status first in response", async () => {
    await logSession({
      date: "2026-03-10", session_type: "push", session_order: 1,
      ad_hoc_injury: true,
      injury: { pain_level: 5, location: "left shoulder" },
    }, testDb, sqlite);

    const result = await checkIn(testDb);
    const data = parseResult(result);
    const keys = Object.keys(data);
    expect(keys[0]).toBe("injuryStatus");
    expect(data.injuryStatus[0].painLevel).toBe(5);
    expect(data.injuryStatus[0].location).toBe("left shoulder");
  });

  it("includes severity alert for pain >= 8 (FR34)", async () => {
    await logSession({
      date: "2026-03-10", session_type: "push", session_order: 1,
      ad_hoc_injury: true,
      injury: { pain_level: 9, location: "right knee" },
    }, testDb, sqlite);

    const result = await checkIn(testDb);
    const data = parseResult(result);
    expect(data.severityAlert).toBeDefined();
    expect(data.severityAlert.painLevel).toBe(9);
    expect(data.severityAlert.location).toBe("right knee");
  });

  it("no severity alert when pain < 8", async () => {
    await logSession({
      date: "2026-03-10", session_type: "push", session_order: 1,
      ad_hoc_injury: true,
      injury: { pain_level: 7, location: "wrist" },
    }, testDb, sqlite);

    const result = await checkIn(testDb);
    const data = parseResult(result);
    expect(data.severityAlert).toBeUndefined();
  });

  it("severity alert fires at boundary pain level 8", async () => {
    await logSession({
      date: "2026-03-10", session_type: "push", session_order: 1,
      ad_hoc_injury: true,
      injury: { pain_level: 8, location: "lower back" },
    }, testDb, sqlite);

    const result = await checkIn(testDb);
    const data = parseResult(result);
    expect(data.severityAlert).toBeDefined();
    expect(data.severityAlert.painLevel).toBe(8);
    expect(data.severityAlert.location).toBe("lower back");
  });

  it("severity alert uses worst injury, not just most recent", async () => {
    // Older high-pain injury
    await logSession({
      date: "2026-03-09", session_type: "push", session_order: 1,
      ad_hoc_injury: true,
      injury: { pain_level: 9, location: "right knee" },
    }, testDb, sqlite);
    // Newer low-pain injury
    await logSession({
      date: "2026-03-10", session_type: "pull", session_order: 1,
      ad_hoc_injury: true,
      injury: { pain_level: 3, location: "left wrist" },
    }, testDb, sqlite);

    const result = await checkIn(testDb);
    const data = parseResult(result);
    expect(data.severityAlert).toBeDefined();
    expect(data.severityAlert.painLevel).toBe(9);
    expect(data.severityAlert.location).toBe("right knee");
  });
});

describe("check_in — health observations", () => {
  it("returns recent health observations", async () => {
    await logSession({
      date: "2026-03-10", session_type: "rest", session_order: 1,
      health: { sleep_quality: 4, energy_level: 3, soreness_level: 2 },
    }, testDb, sqlite);

    const result = await checkIn(testDb);
    const data = parseResult(result);
    expect(data.healthObservations).toHaveLength(1);
    expect(data.healthObservations[0].sleepQuality).toBe(4);
  });
});

describe("check_in — last session", () => {
  it("returns last session summary with exercises", async () => {
    await logSession({
      date: "2026-03-10", session_type: "push", session_order: 1,
      rpe: 7,
      exercises: [{ exercise_id: 1, sets: 3, reps: "10,10,8" }],
    }, testDb, sqlite);

    const result = await checkIn(testDb);
    const data = parseResult(result);
    expect(data.lastSession.date).toBe("2026-03-10");
    expect(data.lastSession.sessionType).toBe("push");
    expect(data.lastSession.rpe).toBe(7);
    expect(data.lastSession.exercises).toHaveLength(1);
    expect(data.lastSession.exercises[0].name).toBe("Push-Up");
  });
});

describe("check_in — upcoming plan preview", () => {
  it("returns upcoming plan sessions", async () => {
    await updatePlan({
      action: "create",
      mesocycle_name: "Test Block",
      phase: "base",
      week_number: 1,
      start_date: "2026-03-01",
      sessions: [
        { session_type: "push", day_of_week: "monday", exercises: [{ exercise_id: 1, sets: 3, reps: "10" }] },
        { session_type: "pull", day_of_week: "wednesday", exercises: [{ exercise_id: 2, sets: 3, reps: "8" }] },
      ],
    }, testDb, sqlite);

    const result = await checkIn(testDb);
    const data = parseResult(result);
    expect(data.upcomingPlan).toBeDefined();
    expect(data.upcomingPlan.mesocycleName).toBe("Test Block");
    expect(data.upcomingPlan.sessions).toHaveLength(2);
  });
});

describe("check_in — training load (FR33)", () => {
  it("returns training load summary from past 7 days", async () => {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    await logSession({
      date: today, session_type: "push", session_order: 1,
      rpe: 8,
      exercises: [{ exercise_id: 1, sets: 3, reps: "10" }],
    }, testDb, sqlite);
    await logSession({
      date: yesterday, session_type: "pull", session_order: 1,
      rpe: 7,
      exercises: [{ exercise_id: 2, sets: 3, reps: "8" }],
    }, testDb, sqlite);

    const result = await checkIn(testDb);
    const data = parseResult(result);
    expect(data.trainingLoad.totalSessions).toBe(2);
    expect(data.trainingLoad.averageRpe).toBe(7.5);
    expect(data.trainingLoad.restDays).toBeGreaterThanOrEqual(5);
  });
});

describe("check_in — skipped sessions (FR32)", () => {
  it("detects planned-but-unlogged sessions from past days", async () => {
    // Find yesterday's day name
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const yesterdayDay = dayNames[yesterday.getDay()];
    const y = yesterday.getFullYear();
    const m = String(yesterday.getMonth() + 1).padStart(2, "0");
    const d = String(yesterday.getDate()).padStart(2, "0");
    const yesterdayStr = `${y}-${m}-${d}`;

    // Create plan with a session on yesterday's day of week
    await updatePlan({
      action: "create",
      mesocycle_name: "Skip Test",
      phase: "base",
      week_number: 1,
      start_date: "2026-03-01",
      sessions: [
        { session_type: "push", day_of_week: yesterdayDay, exercises: [{ exercise_id: 1, sets: 3, reps: "10" }] },
      ],
    }, testDb, sqlite);

    // Don't log any session — it should appear as skipped
    const result = await checkIn(testDb);
    const data = parseResult(result);
    expect(data.skippedSessions).toBeDefined();
    const yesterdaySkipped = data.skippedSessions.filter((s: { date: string }) => s.date === yesterdayStr);
    expect(yesterdaySkipped.length).toBeGreaterThanOrEqual(1);
    expect(yesterdaySkipped[0].sessionType).toBe("push");
  });

  it("does not flag today's sessions as skipped", async () => {
    const today = new Date();
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const todayDay = dayNames[today.getDay()];

    // Find a day that is NOT any of the past 7 days except today
    // Create plan with session only on today's day
    await updatePlan({
      action: "create",
      mesocycle_name: "Today Test",
      phase: "base",
      week_number: 1,
      start_date: "2026-03-01",
      sessions: [
        { session_type: "push", day_of_week: todayDay, exercises: [{ exercise_id: 1, sets: 3, reps: "10" }] },
      ],
    }, testDb, sqlite);

    const result = await checkIn(testDb);
    const data = parseResult(result);

    const y = today.getFullYear();
    const mo = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const todayStr = `${y}-${mo}-${d}`;

    // Today should not appear in skipped (it's still upcoming)
    if (data.skippedSessions) {
      const todaySkipped = data.skippedSessions.filter((s: { date: string }) => s.date === todayStr);
      expect(todaySkipped).toHaveLength(0);
    }
  });
});

describe("check_in — coaching intelligence absent when clean", () => {
  it("omits skippedSessions and severityAlert when clean", async () => {
    // Only log a session today, no plan to compare against
    const today = new Date().toISOString().split("T")[0];
    await logSession({
      date: today, session_type: "push", session_order: 1,
      exercises: [{ exercise_id: 1, sets: 3, reps: "10" }],
    }, testDb, sqlite);

    const result = await checkIn(testDb);
    const data = parseResult(result);
    expect(data.skippedSessions).toBeUndefined();
    expect(data.severityAlert).toBeUndefined();
  });
});

describe("check_in — error handling", () => {
  it("returns isError on DB failure", async () => {
    const closedSqlite = new Database(":memory:");
    const closedDb = drizzle(closedSqlite, { schema });
    closedSqlite.close();

    const result = await checkIn(closedDb);
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to check in");
  });
});
