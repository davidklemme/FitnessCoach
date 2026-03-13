import { z } from "zod";
import { db as defaultDb } from "../db/connection.js";
import { sqlite as defaultSqlite } from "../db/connection.js";
import {
  sessionLogs,
  sessionLogEntries,
} from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { log } from "../lib/logger.js";

const exerciseEntrySchema = z.object({
  exercise_id: z.number().int().describe("Exercise ID from exercise library"),
  sets: z.number().int().min(1).describe("Number of sets completed"),
  reps: z.string().describe("Reps completed (e.g. '8', '8,8,6', 'AMRAP')"),
  weight: z.string().optional().describe("Weight used (e.g. '135lb', 'bodyweight')"),
  rpe_per_exercise: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("RPE for this specific exercise (1-10)"),
  notes: z.string().optional().describe("Notes for this exercise"),
});

export const logSessionSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format")
    .describe("Session date (YYYY-MM-DD)"),
  session_type: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .describe("Session type (e.g. push, pull, legs, full_body, cardio)"),
  session_order: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe("Order if multiple sessions of same type on same day (default 1)"),
  rpe: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Overall session RPE (1-10)"),
  prehab_completed: z
    .boolean()
    .optional()
    .describe("Whether prehab exercises were completed"),
  notes: z.string().optional().describe("Free-text session notes"),
  exercises: z
    .array(exerciseEntrySchema)
    .min(1)
    .describe("Exercises performed in this session"),
});

export type LogSessionInput = z.infer<typeof logSessionSchema>;

export async function logSession(
  params: LogSessionInput,
  database: typeof defaultDb = defaultDb,
  sqliteConn: typeof defaultSqlite = defaultSqlite
) {
  try {
    const result = sqliteConn.transaction(() => {
      // Check for existing session (upsert — NFR3)
      const existing = database
        .select({ id: sessionLogs.id })
        .from(sessionLogs)
        .where(
          and(
            eq(sessionLogs.date, params.date),
            eq(sessionLogs.sessionType, params.session_type),
            eq(sessionLogs.sessionOrder, params.session_order)
          )
        )
        .get();

      let sessionLogId: number;

      if (existing) {
        // Upsert: update the existing session log
        database
          .update(sessionLogs)
          .set({
            rpe: params.rpe ?? null,
            prehabCompleted: params.prehab_completed ?? null,
            notes: params.notes ?? null,
          })
          .where(eq(sessionLogs.id, existing.id))
          .run();

        // Delete old entries before re-inserting
        database
          .delete(sessionLogEntries)
          .where(eq(sessionLogEntries.sessionLogId, existing.id))
          .run();

        sessionLogId = existing.id;
      } else {
        const inserted = database
          .insert(sessionLogs)
          .values({
            date: params.date,
            sessionType: params.session_type,
            sessionOrder: params.session_order,
            rpe: params.rpe ?? null,
            prehabCompleted: params.prehab_completed ?? null,
            notes: params.notes ?? null,
            createdAt: new Date().toISOString(),
          })
          .returning()
          .get();

        sessionLogId = inserted.id;
      }

      // Insert exercise entries
      const entries = [];
      for (const ex of params.exercises) {
        const entry = database
          .insert(sessionLogEntries)
          .values({
            sessionLogId,
            exerciseId: ex.exercise_id,
            sets: ex.sets,
            reps: ex.reps,
            weight: ex.weight ?? null,
            rpePerExercise: ex.rpe_per_exercise ?? null,
            notes: ex.notes ?? null,
          })
          .returning()
          .get();
        entries.push(entry);
      }

      return { sessionLogId, entryCount: entries.length, upserted: !!existing };
    })();

    const response: Record<string, unknown> = {
      sessionLogId: result.sessionLogId,
      date: params.date,
      sessionType: params.session_type,
      sessionOrder: params.session_order,
      entryCount: result.entryCount,
    };

    if (params.rpe !== undefined) {
      response.rpe = params.rpe;
    }
    if (params.prehab_completed !== undefined) {
      response.prehabCompleted = params.prehab_completed;
    }
    if (result.upserted) {
      response.upserted = true;
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
    log("error", "log_session", message, { date: params.date, sessionType: params.session_type }, database);
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to log session: ${message}`,
        },
      ],
      isError: true,
    };
  }
}
