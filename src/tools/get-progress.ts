import { z } from "zod";
import { db as defaultDb } from "../db/connection.js";
import { sqlite as defaultSqlite } from "../db/connection.js";
import {
  sessionLogs,
  sessionLogEntries,
  exercises,
  benchmarks,
} from "../db/schema.js";
import { eq, desc, and, gte, like } from "drizzle-orm";
import { log } from "../lib/logger.js";

export const getProgressSchema = z.object({
  exercise_id: z
    .number()
    .int()
    .optional()
    .describe("Filter by exercise ID for exercise-specific trends"),
  exercise_name: z
    .string()
    .optional()
    .describe("Filter by exercise name (partial match, case-insensitive)"),
  weeks: z
    .number()
    .int()
    .min(1)
    .max(52)
    .optional()
    .default(8)
    .describe("Number of weeks of history to include (default 8)"),
});

export type GetProgressInput = z.infer<typeof getProgressSchema>;

export async function getProgress(
  params: GetProgressInput,
  database: typeof defaultDb = defaultDb,
  sqliteConn: typeof defaultSqlite = defaultSqlite
) {
  try {
    const response: Record<string, unknown> = {};

    // Calculate date cutoff
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - params.weeks * 7);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];

    // --- Exercise-specific trends ---
    if (params.exercise_id || params.exercise_name) {
      let exerciseId = params.exercise_id;

      if (!exerciseId && params.exercise_name) {
        const found = database
          .select({ id: exercises.id, name: exercises.name })
          .from(exercises)
          .where(like(exercises.name, `%${params.exercise_name}%`))
          .all();

        if (found.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No exercise found matching "${params.exercise_name}". Use get_exercise_library to browse available exercises.`,
              },
            ],
            isError: true,
          };
        }
        if (found.length > 1) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  message: `Multiple exercises match "${params.exercise_name}". Specify exercise_id instead.`,
                  matches: found.map((e) => ({ id: e.id, name: e.name })),
                }),
              },
            ],
            isError: true,
          };
        }
        exerciseId = found[0].id;
      }

      // Get exercise name for response
      const exercise = database
        .select({ name: exercises.name })
        .from(exercises)
        .where(eq(exercises.id, exerciseId!))
        .get();

      if (!exercise) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Exercise ID ${exerciseId} not found.`,
            },
          ],
          isError: true,
        };
      }

      // Query session log entries for this exercise within date range
      const entries = database
        .select({
          date: sessionLogs.date,
          sets: sessionLogEntries.sets,
          reps: sessionLogEntries.reps,
          weight: sessionLogEntries.weight,
          rpePerExercise: sessionLogEntries.rpePerExercise,
          sessionRpe: sessionLogs.rpe,
        })
        .from(sessionLogEntries)
        .innerJoin(sessionLogs, eq(sessionLogEntries.sessionLogId, sessionLogs.id))
        .where(
          and(
            eq(sessionLogEntries.exerciseId, exerciseId!),
            gte(sessionLogs.date, cutoffStr)
          )
        )
        .orderBy(sessionLogs.date)
        .all();

      if (entries.length === 0) {
        response.exerciseTrends = {
          exerciseId,
          exerciseName: exercise.name,
          message: `No session data found for ${exercise.name} in the last ${params.weeks} weeks.`,
          dataPoints: [],
        };
      } else {
        const dataPoints = entries.map((e) => {
          const point: Record<string, unknown> = {
            date: e.date,
            sets: e.sets,
            reps: e.reps,
          };
          if (e.weight) point.weight = e.weight;
          if (e.rpePerExercise !== null) point.rpe = e.rpePerExercise;
          else if (e.sessionRpe !== null) point.rpe = e.sessionRpe;
          return point;
        });

        response.exerciseTrends = {
          exerciseId,
          exerciseName: exercise.name,
          weeks: params.weeks,
          dataPoints,
        };
      }
    }

    // --- Benchmarks (always included) ---
    const allBenchmarks = database.select().from(benchmarks).all();

    if (allBenchmarks.length === 0) {
      response.benchmarks = {
        message: "No benchmarks configured. Seed data may not have been applied.",
        components: [],
      };
    } else {
      response.benchmarks = {
        components: allBenchmarks.map((b) => {
          const component: Record<string, unknown> = {
            goalComponent: b.goalComponent,
            targetValue: b.targetValue,
            unit: b.unit,
          };
          if (b.currentValue !== null) {
            component.currentValue = b.currentValue;
          }
          if (b.lastTestedDate !== null) {
            component.lastTestedDate = b.lastTestedDate;
          }
          return component;
        }),
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(response),
        },
      ],
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    log("error", "get_progress", message, {}, database);
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to get progress: ${message}`,
        },
      ],
      isError: true,
    };
  }
}
