import { z } from "zod";
import { db as defaultDb } from "../db/connection.js";
import { sqlite as defaultSqlite } from "../db/connection.js";
import {
  sessionLogs,
  sessionLogEntries,
  exercises,
  benchmarks,
} from "../db/schema.js";
import { eq, and, gte, like } from "drizzle-orm";
import { log } from "../lib/logger.js";

function parseTimeToSeconds(time: string): number {
  const parts = time.split(":").map(Number);
  if (parts.length === 3) {
    const val = parts[0] * 3600 + parts[1] * 60 + parts[2];
    return Number.isNaN(val) ? 0 : val;
  }
  if (parts.length === 2) {
    const val = parts[0] * 60 + parts[1];
    return Number.isNaN(val) ? 0 : val;
  }
  const val = parseFloat(time);
  return Number.isNaN(val) ? 0 : val;
}

interface RunningWeekRow {
  week_label: string;
  week_start: string;
  total_distance: number;
}

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

    // --- Bottleneck detection (FR28) ---
    if (allBenchmarks.length > 0) {
      const withValues = allBenchmarks.filter((b) => b.currentValue !== null);
      if (withValues.length > 0) {
        const bottlenecks = withValues
          .map((b) => {
            let percentComplete: number;
            if (b.unit === "time") {
              const targetSec = parseTimeToSeconds(b.targetValue);
              const currentSec = parseTimeToSeconds(b.currentValue!);
              percentComplete =
                currentSec > 0 ? (targetSec / currentSec) * 100 : 0;
            } else {
              const target = parseFloat(b.targetValue);
              const current = parseFloat(b.currentValue!);
              percentComplete = target > 0 ? (current / target) * 100 : 0;
            }
            return {
              goalComponent: b.goalComponent,
              targetValue: b.targetValue,
              currentValue: b.currentValue!,
              unit: b.unit,
              percentComplete: Math.round(percentComplete),
            };
          })
          .filter((b) => b.percentComplete < 100)
          .sort((a, b) => a.percentComplete - b.percentComplete);

        if (bottlenecks.length > 0) {
          response.bottlenecks = bottlenecks;
        }
      }
    }

    // --- Running volume analysis (FR29) ---
    const runningWeeks = sqliteConn
      .prepare(
        `SELECT
          strftime('%Y-W%W', sl.date) AS week_label,
          MIN(sl.date) AS week_start,
          SUM(CAST(sle.weight AS REAL)) AS total_distance
        FROM session_log_entries sle
        JOIN session_logs sl ON sle.session_log_id = sl.id
        JOIN exercises e ON sle.exercise_id = e.id
        WHERE LOWER(e.name) LIKE '%run%'
          AND sl.date >= ?
          AND sle.weight IS NOT NULL
        GROUP BY strftime('%Y-W%W', sl.date)
        ORDER BY week_label ASC`
      )
      .all(cutoffStr) as RunningWeekRow[];

    if (runningWeeks.length > 0) {
      const weeks = runningWeeks.map((w, i) => {
        const week: Record<string, unknown> = {
          week: w.week_label,
          weekStart: w.week_start,
          totalDistance: w.total_distance,
        };
        if (i > 0) {
          const prev = runningWeeks[i - 1].total_distance;
          if (prev > 0) {
            const pct =
              Math.round(
                ((w.total_distance - prev) / prev) * 1000
              ) / 10;
            week.increasePercent = pct;
            week.exceedsRule = pct > 10;
          }
        }
        return week;
      });

      response.runningVolume = { weeks };
    } else {
      response.runningVolume = {
        message:
          "No running data found. Log running sessions with distance in the weight field to track volume.",
        weeks: [],
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
