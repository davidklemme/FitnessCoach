import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { unlinkSync, existsSync } from "node:fs";
import { and, lte, like, sql } from "drizzle-orm";
import * as schema from "../db/schema.js";

const TEST_DB = "./test-exercise-library.db";
let sqlite: InstanceType<typeof Database>;
let testDb: ReturnType<typeof drizzle>;

const SEED_EXERCISES = [
  {
    name: "Push-Up",
    locationType: "anywhere",
    equipmentRequired: JSON.stringify(["none"]),
    minDuration: 5,
    jointStressRating: 3,
    muscleGroups: JSON.stringify(["chest", "triceps", "anterior delts"]),
    progressionLadder: JSON.stringify(["knee push-up", "push-up", "diamond push-up"]),
  },
  {
    name: "Pull-Up",
    locationType: "anywhere",
    equipmentRequired: JSON.stringify(["pull-up bar"]),
    minDuration: 10,
    jointStressRating: 4,
    muscleGroups: JSON.stringify(["lats", "biceps", "forearms"]),
    progressionLadder: JSON.stringify(["banded pull-up", "pull-up", "weighted pull-up"]),
  },
  {
    name: "Barbell Squat",
    locationType: "gym",
    equipmentRequired: JSON.stringify(["barbell", "squat rack"]),
    minDuration: 15,
    jointStressRating: 6,
    muscleGroups: JSON.stringify(["quads", "glutes", "hamstrings"]),
    progressionLadder: JSON.stringify(["goblet squat", "barbell squat"]),
  },
  {
    name: "Swimming",
    locationType: "pool",
    equipmentRequired: JSON.stringify(["pool access"]),
    minDuration: 30,
    jointStressRating: 1,
    muscleGroups: JSON.stringify(["lats", "shoulders", "cardio"]),
    progressionLadder: null,
  },
  {
    name: "Easy Run",
    locationType: "outdoor",
    equipmentRequired: JSON.stringify(["running shoes"]),
    minDuration: 20,
    jointStressRating: 4,
    muscleGroups: JSON.stringify(["quads", "hamstrings", "calves", "cardio"]),
    progressionLadder: JSON.stringify(["walk/run", "easy run 1mi", "easy run 3mi"]),
  },
];

function cleanUp() {
  for (const suffix of ["", "-wal", "-shm"]) {
    const path = `${TEST_DB}${suffix}`;
    if (existsSync(path)) unlinkSync(path);
  }
}

/**
 * Mirrors the handler's query + format logic against a test DB.
 * This tests the same Drizzle queries and JSON formatting the tool uses.
 */
function queryAndFormat(params: {
  location_type?: string;
  equipment?: string;
  max_joint_stress?: number;
  muscle_group?: string;
}) {
  const conditions = [];

  if (params.location_type) {
    conditions.push(
      sql`(${schema.exercises.locationType} = ${params.location_type} OR ${schema.exercises.locationType} = 'anywhere')`
    );
  }
  if (params.equipment) {
    conditions.push(like(schema.exercises.equipmentRequired, `%${params.equipment}%`));
  }
  if (params.max_joint_stress !== undefined) {
    conditions.push(lte(schema.exercises.jointStressRating, params.max_joint_stress));
  }
  if (params.muscle_group) {
    conditions.push(like(schema.exercises.muscleGroups, `%${params.muscle_group}%`));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const results = testDb.select().from(schema.exercises).where(where).all();

  // Apply the same formatting as the handler
  const formatted = results.map((row) => {
    const entry: Record<string, unknown> = {
      id: row.id,
      name: row.name,
      locationType: row.locationType,
      equipmentRequired: JSON.parse(row.equipmentRequired),
      minDuration: row.minDuration,
      jointStressRating: row.jointStressRating,
      muscleGroups: JSON.parse(row.muscleGroups),
    };
    if (row.progressionLadder) {
      entry.progressionLadder = JSON.parse(row.progressionLadder);
    }
    return entry;
  });

  return {
    exercises: formatted,
    _meta: { count: formatted.length },
  };
}

beforeAll(() => {
  cleanUp();
  sqlite = new Database(TEST_DB);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: "./drizzle/migrations" });

  // Clear seed data from migration so we control the test data
  testDb.delete(schema.exercises).run();

  for (const exercise of SEED_EXERCISES) {
    testDb.insert(schema.exercises).values(exercise).run();
  }
});

afterAll(() => {
  sqlite.close();
  cleanUp();
});

describe("get_exercise_library", () => {
  it("returns all exercises when no filters provided", () => {
    const data = queryAndFormat({});
    expect(data.exercises).toHaveLength(5);
    expect(data._meta.count).toBe(5);
  });

  it("filters by location_type and includes anywhere exercises", () => {
    const data = queryAndFormat({ location_type: "gym" });
    const names = data.exercises.map((e) => e.name);
    expect(names).toContain("Barbell Squat");
    expect(names).toContain("Push-Up"); // anywhere
    expect(names).toContain("Pull-Up"); // anywhere
    expect(names).not.toContain("Swimming");
    expect(names).not.toContain("Easy Run");
  });

  it("filters by equipment (JSON array partial match)", () => {
    const data = queryAndFormat({ equipment: "pull-up bar" });
    expect(data.exercises.length).toBeGreaterThan(0);
    expect(
      data.exercises.every((e) =>
        (e.equipmentRequired as string[]).some((eq) => eq.includes("pull-up bar"))
      )
    ).toBe(true);
  });

  it("filters by max_joint_stress", () => {
    const data = queryAndFormat({ max_joint_stress: 2 });
    expect(
      data.exercises.every((e) => (e.jointStressRating as number) <= 2)
    ).toBe(true);
    expect(data.exercises.map((e) => e.name)).toContain("Swimming");
  });

  it("filters by muscle_group", () => {
    const data = queryAndFormat({ muscle_group: "lats" });
    expect(data.exercises.length).toBeGreaterThan(0);
    expect(
      data.exercises.every((e) => (e.muscleGroups as string[]).includes("lats"))
    ).toBe(true);
  });

  it("combines multiple filters", () => {
    const data = queryAndFormat({
      location_type: "anywhere",
      max_joint_stress: 3,
    });
    expect(
      data.exercises.every((e) => (e.jointStressRating as number) <= 3)
    ).toBe(true);
  });

  it("returns parsed progression ladders as arrays", () => {
    const data = queryAndFormat({});
    const pushUp = data.exercises.find((e) => e.name === "Push-Up");
    expect(pushUp).toBeDefined();
    expect(Array.isArray(pushUp!.progressionLadder)).toBe(true);
    expect(pushUp!.progressionLadder as string[]).toContain("knee push-up");
  });

  it("omits progressionLadder key when null (architecture: omit null keys)", () => {
    const data = queryAndFormat({});
    const swimming = data.exercises.find((e) => e.name === "Swimming");
    expect(swimming).toBeDefined();
    expect("progressionLadder" in swimming!).toBe(false);
  });

  it("returns equipmentRequired as parsed JSON arrays", () => {
    const data = queryAndFormat({});
    const squat = data.exercises.find((e) => e.name === "Barbell Squat");
    expect(Array.isArray(squat!.equipmentRequired)).toBe(true);
    expect(squat!.equipmentRequired as string[]).toContain("barbell");
    expect(squat!.equipmentRequired as string[]).toContain("squat rack");
  });

  it("returns empty array when no exercises match filters", () => {
    const data = queryAndFormat({ equipment: "antigravity chamber" });
    expect(data.exercises).toHaveLength(0);
    expect(data._meta.count).toBe(0);
  });
});
