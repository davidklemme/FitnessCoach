import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { unlinkSync, existsSync } from "node:fs";
import * as schema from "../db/schema.js";
import { getCurrentPlan } from "./get-current-plan.js";

const TEST_DB = "./test-get-current-plan.db";
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

  // Clear seed exercises and insert controlled test data
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
  testDb.delete(schema.planSessionExercises).run();
  testDb.delete(schema.planSessions).run();
  testDb.delete(schema.plans).run();
  testDb.delete(schema.schedulingPreferences).run();
  testDb.delete(schema.systemLogs).run();
});

afterAll(() => {
  sqlite.close();
  cleanUp();
});

function seedActivePlan() {
  testDb
    .insert(schema.plans)
    .values({
      id: 1,
      mesocycleName: "Strength Block A",
      phase: "progressive_overload",
      weekNumber: 2,
      status: "active",
      startDate: "2026-03-01",
      endDate: "2026-04-12",
      createdAt: "2026-03-01T00:00:00.000Z",
    })
    .run();

  testDb
    .insert(schema.planSessions)
    .values([
      { id: 1, planId: 1, sessionType: "push", dayOfWeek: "monday" },
      { id: 2, planId: 1, sessionType: "pull", dayOfWeek: "wednesday" },
      { id: 3, planId: 1, sessionType: "legs", dayOfWeek: "friday" },
    ])
    .run();

  testDb
    .insert(schema.planSessionExercises)
    .values([
      { planSessionId: 1, exerciseId: 1, sets: 4, reps: "12", notes: "slow tempo" },
      { planSessionId: 2, exerciseId: 2, sets: 3, reps: "8" },
      { planSessionId: 3, exerciseId: 3, sets: 5, reps: "5", notes: "belt up" },
    ])
    .run();
}

describe("get_current_plan", () => {
  it("returns actionable error when no active plan exists", async () => {
    const result = await getCurrentPlan(testDb);
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("No active plan found");
    expect(result.content[0].text).toContain("update_plan");
  });

  it("returns active plan with mesocycle details and createdAt", async () => {
    seedActivePlan();
    const result = await getCurrentPlan(testDb);
    const plan = parseResult(result);
    expect(plan.mesocycleName).toBe("Strength Block A");
    expect(plan.phase).toBe("progressive_overload");
    expect(plan.weekNumber).toBe(2);
    expect(plan.status).toBe("active");
    expect(plan.startDate).toBe("2026-03-01");
    expect(plan.createdAt).toBe("2026-03-01T00:00:00.000Z");
  });

  it("includes endDate when present", async () => {
    seedActivePlan();
    const result = await getCurrentPlan(testDb);
    const plan = parseResult(result);
    expect(plan.endDate).toBe("2026-04-12");
  });

  it("omits endDate when null", async () => {
    testDb
      .insert(schema.plans)
      .values({
        mesocycleName: "Open Block",
        phase: "base",
        weekNumber: 1,
        status: "active",
        startDate: "2026-03-01",
        createdAt: "2026-03-01T00:00:00.000Z",
      })
      .run();

    const result = await getCurrentPlan(testDb);
    const plan = parseResult(result);
    expect("endDate" in plan).toBe(false);
  });

  it("returns sessions grouped with exercises", async () => {
    seedActivePlan();
    const result = await getCurrentPlan(testDb);
    const plan = parseResult(result);
    expect(plan.sessions).toHaveLength(3);

    const pushSession = plan.sessions.find(
      (s: { sessionType: string }) => s.sessionType === "push"
    );
    expect(pushSession).toBeDefined();
    expect(pushSession.dayOfWeek).toBe("monday");
    expect(pushSession.exercises).toHaveLength(1);
    expect(pushSession.exercises[0].name).toBe("Push-Up");
    expect(pushSession.exercises[0].sets).toBe(4);
    expect(pushSession.exercises[0].reps).toBe("12");
  });

  it("includes exercise notes when present, omits when null", async () => {
    seedActivePlan();
    const result = await getCurrentPlan(testDb);
    const plan = parseResult(result);

    const pushSession = plan.sessions.find(
      (s: { sessionType: string }) => s.sessionType === "push"
    );
    expect(pushSession.exercises[0].notes).toBe("slow tempo");

    const pullSession = plan.sessions.find(
      (s: { sessionType: string }) => s.sessionType === "pull"
    );
    expect("notes" in pullSession.exercises[0]).toBe(false);
  });

  it("ignores non-active plans", async () => {
    testDb
      .insert(schema.plans)
      .values({
        mesocycleName: "Old Plan",
        phase: "deload",
        weekNumber: 4,
        status: "completed",
        startDate: "2026-01-01",
        createdAt: "2026-01-01T00:00:00.000Z",
      })
      .run();

    const result = await getCurrentPlan(testDb);
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("No active plan found");
  });

  it("returns sessions with multiple exercises per session", async () => {
    testDb
      .insert(schema.plans)
      .values({
        id: 10,
        mesocycleName: "Full Body",
        phase: "base",
        weekNumber: 1,
        status: "active",
        startDate: "2026-03-01",
        createdAt: "2026-03-01T00:00:00.000Z",
      })
      .run();

    testDb
      .insert(schema.planSessions)
      .values({ id: 10, planId: 10, sessionType: "full_body", dayOfWeek: "tuesday" })
      .run();

    testDb
      .insert(schema.planSessionExercises)
      .values([
        { planSessionId: 10, exerciseId: 1, sets: 3, reps: "10" },
        { planSessionId: 10, exerciseId: 2, sets: 3, reps: "8" },
        { planSessionId: 10, exerciseId: 3, sets: 4, reps: "6" },
      ])
      .run();

    const result = await getCurrentPlan(testDb);
    const plan = parseResult(result);
    expect(plan.sessions).toHaveLength(1);
    expect(plan.sessions[0].exercises).toHaveLength(3);
  });

  it("returns empty sessions array when plan has no sessions", async () => {
    testDb
      .insert(schema.plans)
      .values({
        mesocycleName: "Empty Plan",
        phase: "base",
        weekNumber: 1,
        status: "active",
        startDate: "2026-03-01",
        createdAt: "2026-03-01T00:00:00.000Z",
      })
      .run();

    const result = await getCurrentPlan(testDb);
    const plan = parseResult(result);
    expect(plan.sessions).toHaveLength(0);
  });

  it("includes session with zero exercises (LEFT JOIN)", async () => {
    testDb
      .insert(schema.plans)
      .values({
        id: 20,
        mesocycleName: "Partial Plan",
        phase: "base",
        weekNumber: 1,
        status: "active",
        startDate: "2026-03-01",
        createdAt: "2026-03-01T00:00:00.000Z",
      })
      .run();

    testDb
      .insert(schema.planSessions)
      .values([
        { id: 20, planId: 20, sessionType: "push", dayOfWeek: "monday" },
        { id: 21, planId: 20, sessionType: "pull", dayOfWeek: "wednesday" },
      ])
      .run();

    // Only add exercises to the first session
    testDb
      .insert(schema.planSessionExercises)
      .values({ planSessionId: 20, exerciseId: 1, sets: 3, reps: "10" })
      .run();

    const result = await getCurrentPlan(testDb);
    const plan = parseResult(result);
    expect(plan.sessions).toHaveLength(2);

    const pullSession = plan.sessions.find(
      (s: { sessionType: string }) => s.sessionType === "pull"
    );
    expect(pullSession).toBeDefined();
    expect(pullSession.exercises).toHaveLength(0);
  });

  it("returns isError on DB failure", async () => {
    const closedSqlite = new Database(":memory:");
    const closedDb = drizzle(closedSqlite, { schema });
    closedSqlite.close();

    const result = await getCurrentPlan(closedDb);
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to retrieve");
  });

  it("logs warning when multiple active plans exist", async () => {
    testDb
      .insert(schema.plans)
      .values([
        {
          mesocycleName: "Plan A",
          phase: "base",
          weekNumber: 1,
          status: "active",
          startDate: "2026-03-01",
          createdAt: "2026-03-01T00:00:00.000Z",
        },
        {
          mesocycleName: "Plan B",
          phase: "base",
          weekNumber: 1,
          status: "active",
          startDate: "2026-03-08",
          createdAt: "2026-03-08T00:00:00.000Z",
        },
      ])
      .run();

    const result = await getCurrentPlan(testDb);
    const plan = parseResult(result);
    // Returns most recently created
    expect(plan.mesocycleName).toBe("Plan B");

    // Warning logged
    const logs = testDb.select().from(schema.systemLogs).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe("warn");
    expect(logs[0].message).toContain("Multiple active plans");
  });

  it("includes scheduling context per session (duration, location, equipment)", async () => {
    seedActivePlan();
    const result = await getCurrentPlan(testDb);
    const plan = parseResult(result);

    // Push session: Push-Up (5min, anywhere, none) → 10min warmup + 5min + 5min transition = 20min
    const pushSession = plan.sessions.find(
      (s: { sessionType: string }) => s.sessionType === "push"
    );
    expect(pushSession.estimatedDuration).toBe(20);
    expect(pushSession.locationTypes).toContain("anywhere");
    expect(pushSession.equipmentNeeded).toHaveLength(0); // "none" is filtered out

    // Legs session: Barbell Squat (15min, gym, barbell+squat rack) → 10 + 15 + 5 = 30min
    const legsSession = plan.sessions.find(
      (s: { sessionType: string }) => s.sessionType === "legs"
    );
    expect(legsSession.estimatedDuration).toBe(30);
    expect(legsSession.locationTypes).toContain("gym");
    expect(legsSession.equipmentNeeded).toContain("barbell");
    expect(legsSession.equipmentNeeded).toContain("squat rack");
  });

  it("includes scheduling preferences when configured", async () => {
    seedActivePlan();
    testDb.insert(schema.schedulingPreferences).values({
      earliestTime: "07:00",
      latestTime: "19:00",
      meetingBufferMinutes: 45,
      blackoutPatternsJson: JSON.stringify(["lunch 12:00-13:00"]),
      updatedAt: "2026-03-10T00:00:00.000Z",
    }).run();

    const result = await getCurrentPlan(testDb);
    const plan = parseResult(result);

    expect(plan.schedulingPreferences.earliestTime).toBe("07:00");
    expect(plan.schedulingPreferences.latestTime).toBe("19:00");
    expect(plan.schedulingPreferences.meetingBufferMinutes).toBe(45);
    expect(plan.schedulingPreferences.blackoutPatterns).toContain("lunch 12:00-13:00");
  });

  it("omits scheduling preferences when not configured", async () => {
    seedActivePlan();
    const result = await getCurrentPlan(testDb);
    const plan = parseResult(result);
    expect("schedulingPreferences" in plan).toBe(false);
  });
});
