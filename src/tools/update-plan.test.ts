import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { unlinkSync, existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { updatePlan } from "./update-plan.js";
import type { UpdatePlanInput } from "./update-plan.js";
import { getCurrentPlan } from "./get-current-plan.js";

const TEST_DB = "./test-update-plan.db";
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
      {
        id: 4,
        name: "Diamond Push-Up",
        locationType: "anywhere",
        equipmentRequired: JSON.stringify(["none"]),
        minDuration: 5,
        jointStressRating: 4,
        muscleGroups: JSON.stringify(["chest", "triceps"]),
      },
      {
        id: 5,
        name: "Walking Lunge",
        locationType: "anywhere",
        equipmentRequired: JSON.stringify(["none"]),
        minDuration: 10,
        jointStressRating: 2,
        muscleGroups: JSON.stringify(["quads", "glutes"]),
      },
      {
        id: 6,
        name: "Plank",
        locationType: "anywhere",
        equipmentRequired: JSON.stringify(["none"]),
        minDuration: 5,
        jointStressRating: 1,
        muscleGroups: JSON.stringify(["core", "shoulders"]),
      },
    ])
    .run();
});

beforeEach(() => {
  testDb.delete(schema.planSessionExercises).run();
  testDb.delete(schema.planSessions).run();
  testDb.delete(schema.plans).run();
  testDb.delete(schema.systemLogs).run();
});

afterAll(() => {
  sqlite.close();
  cleanUp();
});

async function createTestPlan() {
  return updatePlan(createInput, testDb, sqlite);
}

const createInput: UpdatePlanInput = {
  action: "create",
  mesocycle_name: "Strength Block A",
  phase: "progressive_overload",
  week_number: 1,
  start_date: "2026-03-01",
  sessions: [
    {
      session_type: "push",
      day_of_week: "monday",
      exercises: [
        { exercise_id: 1, sets: 4, reps: "12" },
      ],
    },
    {
      session_type: "pull",
      day_of_week: "wednesday",
      exercises: [
        { exercise_id: 2, sets: 3, reps: "8" },
      ],
    },
  ],
};

async function createPlan() {
  return updatePlan(createInput, testDb, sqlite);
}

describe("update_plan — create", () => {
  it("creates a new plan with sessions and exercises", async () => {
    const result = await createPlan();
    const data = parseResult(result);
    expect(data.mesocycleName).toBe("Strength Block A");
    expect(data.phase).toBe("progressive_overload");
    expect(data.weekNumber).toBe(1);
    expect(data.status).toBe("active");
    expect(data.sessions).toHaveLength(2);
    expect(data.sessions[0].exerciseCount).toBe(1);
  });

  it("stores plan in database with correct FK relationships", async () => {
    await createPlan();
    const allPlans = testDb.select().from(schema.plans).all();
    expect(allPlans).toHaveLength(1);
    expect(allPlans[0].status).toBe("active");

    const sessions = testDb.select().from(schema.planSessions).all();
    expect(sessions).toHaveLength(2);
    expect(sessions.every((s) => s.planId === allPlans[0].id)).toBe(true);

    const exerciseEntries = testDb.select().from(schema.planSessionExercises).all();
    expect(exerciseEntries).toHaveLength(2);
  });

  it("deactivates existing active plan on create (idempotent)", async () => {
    await createPlan();
    const secondResult = await updatePlan(
      { ...createInput, mesocycle_name: "Block B" },
      testDb,
      sqlite
    );
    const data = parseResult(secondResult);
    expect(data.mesocycleName).toBe("Block B");

    const allPlans = testDb.select().from(schema.plans).all();
    const active = allPlans.filter((p) => p.status === "active");
    const completed = allPlans.filter((p) => p.status === "completed");
    expect(active).toHaveLength(1);
    expect(completed).toHaveLength(1);
    expect(active[0].mesocycleName).toBe("Block B");
  });

  it("includes endDate when provided", async () => {
    const input: UpdatePlanInput = {
      ...createInput,
      end_date: "2026-04-01",
    };
    const result = await updatePlan(input, testDb, sqlite);
    const data = parseResult(result);
    expect(data.endDate).toBe("2026-04-01");
  });

  it("omits endDate when not provided", async () => {
    const result = await createPlan();
    const data = parseResult(result);
    expect("endDate" in data).toBe(false);
  });

  it("rejects create with invalid exercise ID (FK violation)", async () => {
    const input: UpdatePlanInput = {
      action: "create",
      mesocycle_name: "Bad Plan",
      phase: "base",
      week_number: 1,
      start_date: "2026-03-01",
      sessions: [
        {
          session_type: "push",
          day_of_week: "monday",
          exercises: [{ exercise_id: 999, sets: 3, reps: "10" }],
        },
      ],
    };

    const result = await updatePlan(input, testDb, sqlite);
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to update plan");
  });
});

describe("update_plan — swap_exercise", () => {
  it("swaps an exercise in a session", async () => {
    await createPlan();
    const sessions = testDb.select().from(schema.planSessions).all();
    const pushSession = sessions.find((s) => s.sessionType === "push")!;

    const result = await updatePlan(
      {
        action: "swap_exercise",
        plan_session_id: pushSession.id,
        old_exercise_id: 1,
        new_exercise_id: 4,
      },
      testDb,
      sqlite
    );
    const data = parseResult(result);
    expect(data.swapped.newExerciseId).toBe(4);
    expect(data.swapped.newExerciseName).toBe("Diamond Push-Up");

    const entry = testDb
      .select()
      .from(schema.planSessionExercises)
      .where(eq(schema.planSessionExercises.planSessionId, pushSession.id))
      .get()!;
    expect(entry.exerciseId).toBe(4);
  });

  it("returns error for nonexistent new exercise", async () => {
    await createPlan();
    const sessions = testDb.select().from(schema.planSessions).all();

    const result = await updatePlan(
      {
        action: "swap_exercise",
        plan_session_id: sessions[0].id,
        old_exercise_id: 1,
        new_exercise_id: 999,
      },
      testDb,
      sqlite
    );
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("returns error when session not in active plan", async () => {
    await createPlan();
    // Deactivate the plan
    testDb.update(schema.plans).set({ status: "completed" }).run();

    const result = await updatePlan(
      {
        action: "swap_exercise",
        plan_session_id: 1,
        old_exercise_id: 1,
        new_exercise_id: 4,
      },
      testDb,
      sqlite
    );
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("not found in active plan");
  });

  it("returns error for nonexistent session ID", async () => {
    await createPlan();
    const result = await updatePlan(
      {
        action: "swap_exercise",
        plan_session_id: 999,
        old_exercise_id: 1,
        new_exercise_id: 4,
      },
      testDb,
      sqlite
    );
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("not found in active plan");
  });

  it("is idempotent — repeating same swap returns success with alreadyApplied", async () => {
    await createPlan();
    const sessions = testDb.select().from(schema.planSessions).all();
    const input: UpdatePlanInput = {
      action: "swap_exercise",
      plan_session_id: sessions[0].id,
      old_exercise_id: 1,
      new_exercise_id: 4,
    };

    await updatePlan(input, testDb, sqlite);
    // Repeat identical call — old_exercise_id 1 no longer exists, but new_exercise_id 4 does
    const result = await updatePlan(input, testDb, sqlite);
    const data = parseResult(result);
    expect(data.swapped.newExerciseId).toBe(4);
    expect(data.swapped.alreadyApplied).toBe(true);
  });
});

describe("update_plan — adjust_volume", () => {
  it("adjusts sets and reps", async () => {
    await createPlan();
    const entries = testDb.select().from(schema.planSessionExercises).all();

    const result = await updatePlan(
      {
        action: "adjust_volume",
        plan_session_exercise_id: entries[0].id,
        sets: 5,
        reps: "10-12",
      },
      testDb,
      sqlite
    );
    const data = parseResult(result);
    expect(data.updated.sets).toBe(5);
    expect(data.updated.reps).toBe("10-12");

    const updated = testDb
      .select()
      .from(schema.planSessionExercises)
      .where(eq(schema.planSessionExercises.id, entries[0].id))
      .get()!;
    expect(updated.sets).toBe(5);
    expect(updated.reps).toBe("10-12");
  });

  it("adjusts only sets when reps not provided", async () => {
    await createPlan();
    const entries = testDb.select().from(schema.planSessionExercises).all();

    const result = await updatePlan(
      {
        action: "adjust_volume",
        plan_session_exercise_id: entries[0].id,
        sets: 6,
      },
      testDb,
      sqlite
    );
    const data = parseResult(result);
    expect(data.updated.sets).toBe(6);
    expect("reps" in data.updated).toBe(false);
  });

  it("returns error when no changes specified", async () => {
    await createPlan();
    const entries = testDb.select().from(schema.planSessionExercises).all();

    const result = await updatePlan(
      {
        action: "adjust_volume",
        plan_session_exercise_id: entries[0].id,
      },
      testDb,
      sqlite
    );
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("No volume changes");
  });

  it("returns error for nonexistent entry", async () => {
    const result = await updatePlan(
      {
        action: "adjust_volume",
        plan_session_exercise_id: 999,
        sets: 5,
      },
      testDb,
      sqlite
    );
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("returns error when entry not in active plan", async () => {
    await createPlan();
    const entries = testDb.select().from(schema.planSessionExercises).all();
    // Deactivate the plan
    testDb.update(schema.plans).set({ status: "completed" }).run();

    const result = await updatePlan(
      {
        action: "adjust_volume",
        plan_session_exercise_id: entries[0].id,
        sets: 5,
      },
      testDb,
      sqlite
    );
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("not found in active plan");
  });
});

describe("update_plan — deload", () => {
  it("reduces sets by ~50% and sets phase to deload", async () => {
    await createPlan();
    const result = await updatePlan({ action: "deload" }, testDb, sqlite);
    const data = parseResult(result);
    expect(data.deload.phase).toBe("deload");
    expect(data.deload.exercisesAdjusted).toBe(2);

    const plan = testDb
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.status, "active"))
      .get()!;
    expect(plan.phase).toBe("deload");

    // Push-Up was 4 sets → 2, Pull-Up was 3 sets → 2 (round(1.5))
    const entries = testDb.select().from(schema.planSessionExercises).all();
    const pushEntry = entries.find((e) => e.exerciseId === 1)!;
    const pullEntry = entries.find((e) => e.exerciseId === 2)!;
    expect(pushEntry.sets).toBe(2);
    expect(pullEntry.sets).toBe(2);
  });

  it("returns error when no active plan exists", async () => {
    const result = await updatePlan({ action: "deload" }, testDb, sqlite);
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("No active plan found");
  });

  it("is idempotent — second deload halves again", async () => {
    await createPlan();
    await updatePlan({ action: "deload" }, testDb, sqlite);
    await updatePlan({ action: "deload" }, testDb, sqlite);

    // 4 → 2 → 1 (minimum 1)
    const entries = testDb.select().from(schema.planSessionExercises).all();
    const pushEntry = entries.find((e) => e.exerciseId === 1)!;
    expect(pushEntry.sets).toBe(1);
  });
});

describe("update_plan — injury_adjust", () => {
  it("substitutes affected exercises with low-stress alternatives", async () => {
    await createPlan();
    const result = await updatePlan(
      { action: "injury_adjust", affected_areas: ["chest"], pain_level: 5 },
      testDb,
      sqlite
    );
    const data = parseResult(result);
    expect(data.injuryAdjust.substitutions).toHaveLength(1);
    expect(data.injuryAdjust.substitutions[0].oldExerciseName).toBe("Push-Up");
    // Should substitute with a low-stress exercise not targeting chest
    expect(data.injuryAdjust.substitutions[0].newExerciseId).not.toBe(1);

    // Verify original_exercise_id is stored in DB
    const entry = testDb
      .select()
      .from(schema.planSessionExercises)
      .where(eq(schema.planSessionExercises.id, data.injuryAdjust.substitutions[0].entryId))
      .get()!;
    expect(entry.originalExerciseId).toBe(1);
  });

  it("flags sessions when no suitable alternative exists", async () => {
    // Create plan with exercises targeting core/shoulders
    // Plank (id 6) targets core/shoulders, jointStress 1
    // When we affect core AND shoulders, no candidate avoids both
    await updatePlan(
      {
        action: "create",
        mesocycle_name: "Test Block",
        phase: "base",
        week_number: 1,
        start_date: "2026-03-01",
        sessions: [
          {
            session_type: "core",
            day_of_week: "monday",
            exercises: [{ exercise_id: 6, sets: 3, reps: "60s" }],
          },
        ],
      },
      testDb,
      sqlite
    );

    // Affect core AND shoulders AND chest AND triceps AND quads AND glutes AND lats AND biceps
    // This ensures every exercise in the library targets at least one affected area
    const result = await updatePlan(
      {
        action: "injury_adjust",
        affected_areas: ["core", "shoulders", "chest", "triceps", "quads", "glutes", "lats", "biceps"],
        pain_level: 6,
      },
      testDb,
      sqlite
    );
    const data = parseResult(result);
    expect(data.injuryAdjust.substitutions).toHaveLength(0);
    expect(data.injuryAdjust.flaggedSessions).toHaveLength(1);
    expect(data.injuryAdjust.flaggedSessions[0].exerciseName).toBe("Plank");
    expect(data.injuryAdjust.flaggedSessions[0].reason).toContain("No suitable");
  });

  it("restores original exercises when pain_level is 0", async () => {
    await createPlan();
    // Injure chest
    await updatePlan(
      { action: "injury_adjust", affected_areas: ["chest"], pain_level: 5 },
      testDb,
      sqlite
    );

    // Verify substitution happened
    const beforeRestore = testDb.select().from(schema.planSessionExercises).all();
    const substituted = beforeRestore.filter((e) => e.originalExerciseId !== null);
    expect(substituted).toHaveLength(1);

    // Restore
    const result = await updatePlan(
      { action: "injury_adjust", affected_areas: ["chest"], pain_level: 0 },
      testDb,
      sqlite
    );
    const data = parseResult(result);
    expect(data.injuryRestore.restoredCount).toBe(1);

    // Verify original exercise is back
    const afterRestore = testDb.select().from(schema.planSessionExercises).all();
    const pushEntry = afterRestore.find((e) => e.planSessionId === substituted[0].planSessionId)!;
    expect(pushEntry.exerciseId).toBe(1); // Push-Up restored
    expect(pushEntry.originalExerciseId).toBeNull();
  });

  it("returns error when no active plan exists", async () => {
    const result = await updatePlan(
      { action: "injury_adjust", affected_areas: ["chest"], pain_level: 5 },
      testDb,
      sqlite
    );
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("No active plan found");
  });

  it("restores only exercises matching affected_areas (scoped restore)", async () => {
    // Create plan with push (chest) and pull (lats) exercises
    await createPlan();

    // Injure chest — substitutes Push-Up
    await updatePlan(
      { action: "injury_adjust", affected_areas: ["chest"], pain_level: 5 },
      testDb,
      sqlite
    );

    // Injure lats — substitutes Pull-Up
    await updatePlan(
      { action: "injury_adjust", affected_areas: ["lats"], pain_level: 4 },
      testDb,
      sqlite
    );

    // Verify both substituted
    const beforeRestore = testDb.select().from(schema.planSessionExercises).all();
    expect(beforeRestore.filter((e) => e.originalExerciseId !== null)).toHaveLength(2);

    // Restore only chest — should only restore Push-Up
    const result = await updatePlan(
      { action: "injury_adjust", affected_areas: ["chest"], pain_level: 0 },
      testDb,
      sqlite
    );
    const data = parseResult(result);
    expect(data.injuryRestore.restoredCount).toBe(1);

    // Push-Up restored, Pull-Up still substituted
    const afterRestore = testDb.select().from(schema.planSessionExercises).all();
    const stillSubstituted = afterRestore.filter((e) => e.originalExerciseId !== null);
    expect(stillSubstituted).toHaveLength(1);
    // The remaining substitution is for Pull-Up (original exercise id 2, lats)
    expect(stillSubstituted[0].originalExerciseId).toBe(2);
  });

  it("returns restoredCount 0 when no substitutions exist", async () => {
    await createPlan();
    const result = await updatePlan(
      { action: "injury_adjust", affected_areas: ["chest"], pain_level: 0 },
      testDb,
      sqlite
    );
    const data = parseResult(result);
    expect(data.injuryRestore.restoredCount).toBe(0);
  });

  it("is idempotent — second injury_adjust skips already-substituted entries", async () => {
    await createPlan();
    await updatePlan(
      { action: "injury_adjust", affected_areas: ["chest"], pain_level: 5 },
      testDb,
      sqlite
    );
    const result = await updatePlan(
      { action: "injury_adjust", affected_areas: ["chest"], pain_level: 5 },
      testDb,
      sqlite
    );
    const data = parseResult(result);
    // Already substituted — no new substitutions
    expect(data.injuryAdjust.substitutions).toHaveLength(0);
  });
});

describe("update_plan — schedule_confirm", () => {
  it("confirms sessions with calendar event IDs", async () => {
    await createTestPlan();

    const planResult = await getCurrentPlan(testDb);
    const plan = parseResult(planResult);
    const sessionId = plan.sessions[0].id;

    const result = await updatePlan({
      action: "schedule_confirm",
      confirmations: [
        { plan_session_id: sessionId, datetime: "2026-03-15T10:00:00Z", calendar_event_id: "gcal_abc123" },
      ],
    }, testDb, sqlite);
    const data = parseResult(result);

    expect(data.scheduleConfirm.confirmed).toHaveLength(1);
    expect(data.scheduleConfirm.confirmed[0].calendarEventId).toBe("gcal_abc123");
    expect(data.scheduleConfirm.confirmed[0].datetime).toBe("2026-03-15T10:00:00Z");
  });

  it("reports failure for session not in active plan", async () => {
    await createTestPlan();

    const result = await updatePlan({
      action: "schedule_confirm",
      confirmations: [
        { plan_session_id: 9999, datetime: "2026-03-15T10:00:00Z", calendar_event_id: "gcal_xyz" },
      ],
    }, testDb, sqlite);
    const data = parseResult(result);

    expect(data.scheduleConfirm.failed).toHaveLength(1);
    expect(data.scheduleConfirm.failed[0].planSessionId).toBe(9999);
  });
});

describe("update_plan — schedule_cancel", () => {
  it("clears scheduling and returns orphaned calendar event ID", async () => {
    await createTestPlan();

    const planResult = await getCurrentPlan(testDb);
    const plan = parseResult(planResult);
    const sessionId = plan.sessions[0].id;

    // First confirm
    await updatePlan({
      action: "schedule_confirm",
      confirmations: [
        { plan_session_id: sessionId, datetime: "2026-03-15T10:00:00Z", calendar_event_id: "gcal_to_cancel" },
      ],
    }, testDb, sqlite);

    // Then cancel
    const result = await updatePlan({
      action: "schedule_cancel",
      plan_session_id: sessionId,
    }, testDb, sqlite);
    const data = parseResult(result);

    expect(data.scheduleCancel.cleared).toBe(true);
    expect(data.scheduleCancel.orphanedCalendarEventId).toBe("gcal_to_cancel");
  });
});

describe("update_plan — schedule_reject", () => {
  it("returns no-change confirmation", async () => {
    const result = await updatePlan({ action: "schedule_reject" }, testDb, sqlite);
    const data = parseResult(result);

    expect(data.scheduleReject.message).toContain("No changes made");
    expect((result as { isError?: boolean }).isError).toBeUndefined();
  });
});

describe("update_plan — error handling", () => {
  it("returns isError on DB failure", async () => {
    const closedSqlite = new Database(":memory:");
    const closedDb = drizzle(closedSqlite, { schema });
    closedSqlite.close();

    const result = await updatePlan(
      { action: "deload" },
      closedDb,
      closedSqlite
    );
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to update plan");
  });
});
