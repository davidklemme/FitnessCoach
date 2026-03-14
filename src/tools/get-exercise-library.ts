import { z } from "zod";
import { db } from "../db/connection.js";
import { exercises } from "../db/schema.js";
import { and, lte, like, sql } from "drizzle-orm";
import { log } from "../lib/logger.js";

export const getExerciseLibrarySchema = {
  location_type: z
    .string()
    .optional()
    .describe("Filter by location: outdoor, gym, pool, anywhere"),
  equipment: z
    .string()
    .optional()
    .describe("Filter by required equipment (partial match in JSON array)"),
  max_joint_stress: z
    .number()
    .int()
    .min(0)
    .max(10)
    .optional()
    .describe("Maximum joint stress rating (0-10)"),
  muscle_group: z
    .string()
    .optional()
    .describe("Filter by muscle group (partial match in JSON array)"),
};

export async function getExerciseLibrary(params: {
  location_type?: string;
  equipment?: string;
  max_joint_stress?: number;
  muscle_group?: string;
}) {
  try {
    const conditions = [];

    if (params.location_type) {
      conditions.push(
        sql`(${exercises.locationType} = ${params.location_type} OR ${exercises.locationType} = 'anywhere')`
      );
    }

    if (params.equipment) {
      conditions.push(
        like(exercises.equipmentRequired, `%${params.equipment}%`)
      );
    }

    if (params.max_joint_stress !== undefined) {
      conditions.push(
        lte(exercises.jointStressRating, params.max_joint_stress)
      );
    }

    if (params.muscle_group) {
      conditions.push(
        like(exercises.muscleGroups, `%${params.muscle_group}%`)
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const results = db.select().from(exercises).where(where).all();

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
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            exercises: formatted,
            _meta: { count: formatted.length },
          }),
        },
      ],
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    log("error", "get_exercise_library", message, { params });
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to query exercise library: ${message}`,
        },
      ],
      isError: true,
    };
  }
}
