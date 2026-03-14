import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { unlinkSync, existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { getProgress } from "./get-progress.js";
import { logSession } from "./log-session.js";
import type { LogSessionInput } from "./log-session.js";
import type { GetProgressInput } from "./get-progress.js";

const TEST_DB = "./test-get-progress.db";
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

  // Ensure exercises exist
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
      {
        id: 4,
        name: "Easy Run",
        locationType: "outdoor",
        equipmentRequired: JSON.stringify(["running shoes"]),
        minDuration: 20,
        jointStressRating: 4,
        muscleGroups: JSON.stringify(["quads", "hamstrings", "calves", "cardio"]),
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
  // Reset benchmarks to seeded values
  testDb.delete(schema.benchmarks).run();
  testDb
    .insert(schema.benchmarks)
    .values([
      { goalComponent: "pull_ups", targetValue: "20", unit: "reps", createdAt: "2026-03-13T00:00:00.000Z" },
      { goalComponent: "push_ups", targetValue: "50", unit: "reps", createdAt: "2026-03-13T00:00:00.000Z" },
      { goalComponent: "squats", targetValue: "100", unit: "kg", createdAt: "2026-03-13T00:00:00.000Z" },
      { goalComponent: "running_5k", targetValue: "25:00", unit: "time", createdAt: "2026-03-13T00:00:00.000Z" },
    ])
    .run();
});

afterAll(() => {
  sqlite.close();
  cleanUp();
});

describe("get_progress — benchmarks", () => {
  it("returns all benchmarks with target values and no current values", async () => {
    const result = await getProgress({ weeks: 8 }, testDb, sqlite);
    const data = parseResult(result);

    expect(data.benchmarks.components).toHaveLength(4);
    const pullUps = data.benchmarks.components.find(
      (c: Record<string, unknown>) => c.goalComponent === "pull_ups"
    );
    expect(pullUps.targetValue).toBe("20");
    expect(pullUps.unit).toBe("reps");
    expect("currentValue" in pullUps).toBe(false);
    expect("lastTestedDate" in pullUps).toBe(false);
  });

  it("returns benchmarks with current values after benchmark test", async () => {
    const input: LogSessionInput = {
      date: "2026-03-10",
      session_type: "test",
      session_order: 1,
      exercises: [{ exercise_id: 2, sets: 1, reps: "15" }],
      benchmark_test: { goal_component: "pull_ups", value: "15" },
    };
    await logSession(input, testDb, sqlite);

    const result = await getProgress({ weeks: 8 }, testDb, sqlite);
    const data = parseResult(result);

    const pullUps = data.benchmarks.components.find(
      (c: Record<string, unknown>) => c.goalComponent === "pull_ups"
    );
    expect(pullUps.currentValue).toBe("15");
    expect(pullUps.lastTestedDate).toBe("2026-03-10");
  });

  it("returns actionable message when no benchmarks exist", async () => {
    testDb.delete(schema.benchmarks).run();

    const result = await getProgress({ weeks: 8 }, testDb, sqlite);
    const data = parseResult(result);

    expect(data.benchmarks.message).toContain("No benchmarks configured");
    expect(data.benchmarks.components).toHaveLength(0);
  });
});

describe("get_progress — exercise trends", () => {
  it("returns exercise trends by exercise_id", async () => {
    // Log two sessions with Push-Up
    const session1: LogSessionInput = {
      date: "2026-03-05",
      session_type: "push",
      session_order: 1,
      rpe: 7,
      exercises: [{ exercise_id: 1, sets: 3, reps: "10,10,8", weight: "bodyweight", rpe_per_exercise: 7 }],
    };
    const session2: LogSessionInput = {
      date: "2026-03-10",
      session_type: "push",
      session_order: 1,
      rpe: 8,
      exercises: [{ exercise_id: 1, sets: 4, reps: "12,12,10,8", weight: "bodyweight", rpe_per_exercise: 8 }],
    };
    await logSession(session1, testDb, sqlite);
    await logSession(session2, testDb, sqlite);

    const result = await getProgress({ exercise_id: 1, weeks: 8 }, testDb, sqlite);
    const data = parseResult(result);

    expect(data.exerciseTrends.exerciseId).toBe(1);
    expect(data.exerciseTrends.exerciseName).toBe("Push-Up");
    expect(data.exerciseTrends.dataPoints).toHaveLength(2);
    expect(data.exerciseTrends.dataPoints[0].date).toBe("2026-03-05");
    expect(data.exerciseTrends.dataPoints[0].sets).toBe(3);
    expect(data.exerciseTrends.dataPoints[0].reps).toBe("10,10,8");
    expect(data.exerciseTrends.dataPoints[1].date).toBe("2026-03-10");
    expect(data.exerciseTrends.dataPoints[1].sets).toBe(4);
  });

  it("returns exercise trends by name (partial match)", async () => {
    const session: LogSessionInput = {
      date: "2026-03-10",
      session_type: "push",
      session_order: 1,
      exercises: [{ exercise_id: 1, sets: 3, reps: "10" }],
    };
    await logSession(session, testDb, sqlite);

    const result = await getProgress({ exercise_name: "Push", weeks: 8 }, testDb, sqlite);
    const data = parseResult(result);

    expect(data.exerciseTrends.exerciseName).toBe("Push-Up");
    expect(data.exerciseTrends.dataPoints).toHaveLength(1);
  });

  it("returns error for unknown exercise name", async () => {
    const result = await getProgress({ exercise_name: "Nonexistent", weeks: 8 }, testDb, sqlite);
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("No exercise found");
  });

  it("returns error for unknown exercise ID", async () => {
    const result = await getProgress({ exercise_id: 999, weeks: 8 }, testDb, sqlite);
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("returns empty data points when no sessions exist for exercise", async () => {
    const result = await getProgress({ exercise_id: 1, weeks: 8 }, testDb, sqlite);
    const data = parseResult(result);

    expect(data.exerciseTrends.exerciseName).toBe("Push-Up");
    expect(data.exerciseTrends.message).toContain("No session data");
    expect(data.exerciseTrends.dataPoints).toHaveLength(0);
  });

  it("returns multiple matches error for ambiguous name", async () => {
    // "Up" matches both "Push-Up" and "Pull-Up"
    const result = await getProgress({ exercise_name: "Up", weeks: 8 }, testDb, sqlite);
    expect((result as { isError?: boolean }).isError).toBe(true);
    const data = parseResult(result);
    expect(data.message).toContain("Multiple exercises");
    expect(data.matches.length).toBeGreaterThan(1);
  });
});

describe("get_progress — benchmark update via log_session", () => {
  it("updates benchmark in same transaction as session log", async () => {
    const input: LogSessionInput = {
      date: "2026-03-10",
      session_type: "test",
      session_order: 1,
      exercises: [{ exercise_id: 3, sets: 1, reps: "1" }],
      benchmark_test: { goal_component: "squats", value: "80" },
    };
    const result = await logSession(input, testDb, sqlite);
    const data = parseResult(result);

    expect(data.benchmarkUpdated).toBe(true);
    expect(data.benchmarkComponent).toBe("squats");
    expect(data.benchmarkValue).toBe("80");

    // Verify DB state
    const benchmark = testDb
      .select()
      .from(schema.benchmarks)
      .where(eq(schema.benchmarks.goalComponent, "squats"))
      .get();
    expect(benchmark?.currentValue).toBe("80");
    expect(benchmark?.lastTestedDate).toBe("2026-03-10");
  });

  it("does not set benchmarkUpdated for unknown goal component", async () => {
    const input: LogSessionInput = {
      date: "2026-03-10",
      session_type: "test",
      session_order: 1,
      exercises: [{ exercise_id: 1, sets: 1, reps: "1" }],
      benchmark_test: { goal_component: "nonexistent", value: "99" },
    };
    const result = await logSession(input, testDb, sqlite);
    const data = parseResult(result);

    expect("benchmarkUpdated" in data).toBe(false);
  });
});

describe("get_progress — bottleneck detection", () => {
  it("flags benchmarks where current is behind target, ranked by gap severity", async () => {
    // Set current values: pull_ups 10/20 (50%), push_ups 40/50 (80%), squats 60/100 (60%)
    testDb.update(schema.benchmarks).set({ currentValue: "10" }).where(eq(schema.benchmarks.goalComponent, "pull_ups")).run();
    testDb.update(schema.benchmarks).set({ currentValue: "40" }).where(eq(schema.benchmarks.goalComponent, "push_ups")).run();
    testDb.update(schema.benchmarks).set({ currentValue: "60" }).where(eq(schema.benchmarks.goalComponent, "squats")).run();

    const result = await getProgress({ weeks: 8 }, testDb, sqlite);
    const data = parseResult(result);

    expect(data.bottlenecks).toHaveLength(3);
    // Ranked by lowest % first: pull_ups (50%) → squats (60%) → push_ups (80%)
    expect(data.bottlenecks[0].goalComponent).toBe("pull_ups");
    expect(data.bottlenecks[0].percentComplete).toBe(50);
    expect(data.bottlenecks[1].goalComponent).toBe("squats");
    expect(data.bottlenecks[1].percentComplete).toBe(60);
    expect(data.bottlenecks[2].goalComponent).toBe("push_ups");
    expect(data.bottlenecks[2].percentComplete).toBe(80);
  });

  it("handles time-based benchmarks (running_5k — lower is better)", async () => {
    // Target 25:00 (1500s), current 30:00 (1800s) → 1500/1800 = 83%
    testDb.update(schema.benchmarks).set({ currentValue: "30:00" }).where(eq(schema.benchmarks.goalComponent, "running_5k")).run();

    const result = await getProgress({ weeks: 8 }, testDb, sqlite);
    const data = parseResult(result);

    const running = data.bottlenecks.find(
      (b: Record<string, unknown>) => b.goalComponent === "running_5k"
    );
    expect(running).toBeDefined();
    expect(running.percentComplete).toBe(83);
  });

  it("does not flag benchmarks that meet or exceed target", async () => {
    testDb.update(schema.benchmarks).set({ currentValue: "25" }).where(eq(schema.benchmarks.goalComponent, "pull_ups")).run();
    testDb.update(schema.benchmarks).set({ currentValue: "50" }).where(eq(schema.benchmarks.goalComponent, "push_ups")).run();
    testDb.update(schema.benchmarks).set({ currentValue: "100" }).where(eq(schema.benchmarks.goalComponent, "squats")).run();
    testDb.update(schema.benchmarks).set({ currentValue: "24:00" }).where(eq(schema.benchmarks.goalComponent, "running_5k")).run();

    const result = await getProgress({ weeks: 8 }, testDb, sqlite);
    const data = parseResult(result);

    expect(data.bottlenecks).toBeUndefined();
  });

  it("omits bottlenecks section when no benchmarks have current values", async () => {
    const result = await getProgress({ weeks: 8 }, testDb, sqlite);
    const data = parseResult(result);

    expect(data.bottlenecks).toBeUndefined();
  });
});

describe("get_progress — running volume analysis", () => {
  it("calculates weekly volume and week-over-week increase", async () => {
    // Week 1: 2 runs × 5km = 10km
    await logSession({
      date: "2026-03-03", session_type: "run", session_order: 1,
      exercises: [{ exercise_id: 4, sets: 1, reps: "1", weight: "5" }],
    }, testDb, sqlite);
    await logSession({
      date: "2026-03-05", session_type: "run", session_order: 1,
      exercises: [{ exercise_id: 4, sets: 1, reps: "1", weight: "5" }],
    }, testDb, sqlite);

    // Week 2: 2 runs × 5.5km = 11km (10% increase)
    await logSession({
      date: "2026-03-10", session_type: "run", session_order: 1,
      exercises: [{ exercise_id: 4, sets: 1, reps: "1", weight: "5.5" }],
    }, testDb, sqlite);
    await logSession({
      date: "2026-03-12", session_type: "run", session_order: 1,
      exercises: [{ exercise_id: 4, sets: 1, reps: "1", weight: "5.5" }],
    }, testDb, sqlite);

    const result = await getProgress({ weeks: 8 }, testDb, sqlite);
    const data = parseResult(result);

    expect(data.runningVolume.weeks).toHaveLength(2);
    expect(data.runningVolume.weeks[0].totalDistance).toBe(10);
    expect(data.runningVolume.weeks[1].totalDistance).toBe(11);
    expect(data.runningVolume.weeks[1].increasePercent).toBe(10);
    expect(data.runningVolume.weeks[1].exceedsRule).toBe(false);
  });

  it("flags weeks exceeding 10% increase", async () => {
    // Week 1: 10km
    await logSession({
      date: "2026-03-03", session_type: "run", session_order: 1,
      exercises: [{ exercise_id: 4, sets: 1, reps: "1", weight: "10" }],
    }, testDb, sqlite);

    // Week 2: 12km (20% increase — flagged)
    await logSession({
      date: "2026-03-10", session_type: "run", session_order: 1,
      exercises: [{ exercise_id: 4, sets: 1, reps: "1", weight: "12" }],
    }, testDb, sqlite);

    const result = await getProgress({ weeks: 8 }, testDb, sqlite);
    const data = parseResult(result);

    expect(data.runningVolume.weeks[1].exceedsRule).toBe(true);
    expect(data.runningVolume.weeks[1].increasePercent).toBe(20);
  });

  it("returns actionable message when no running data exists", async () => {
    const result = await getProgress({ weeks: 8 }, testDb, sqlite);
    const data = parseResult(result);

    expect(data.runningVolume.message).toContain("No running data found");
    expect(data.runningVolume.weeks).toHaveLength(0);
  });

  it("first week has no increase percentage", async () => {
    await logSession({
      date: "2026-03-10", session_type: "run", session_order: 1,
      exercises: [{ exercise_id: 4, sets: 1, reps: "1", weight: "5" }],
    }, testDb, sqlite);

    const result = await getProgress({ weeks: 8 }, testDb, sqlite);
    const data = parseResult(result);

    expect(data.runningVolume.weeks).toHaveLength(1);
    expect(data.runningVolume.weeks[0].increasePercent).toBeUndefined();
    expect(data.runningVolume.weeks[0].exceedsRule).toBeUndefined();
  });
});

describe("get_progress — error handling", () => {
  it("returns isError on DB failure", async () => {
    const closedSqlite = new Database(":memory:");
    const closedDb = drizzle(closedSqlite, { schema });
    closedSqlite.close();

    const result = await getProgress({ weeks: 8 }, closedDb, closedSqlite);
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to get progress");
  });
});
