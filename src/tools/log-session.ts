import { z } from "zod";
import { db as defaultDb } from "../db/connection.js";
import { sqlite as defaultSqlite } from "../db/connection.js";
import {
  sessionLogs,
  sessionLogEntries,
  injuryStatusLog,
  healthObservations,
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

const injurySchema = z.object({
  pain_level: z
    .number()
    .int()
    .min(0)
    .max(10)
    .describe("Pain level (0-10)"),
  location: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .describe("Body location of injury (e.g. 'left shoulder', 'right knee')"),
  trigger_exercise_id: z
    .number()
    .int()
    .optional()
    .describe("Exercise ID that triggered/aggravated the injury"),
  severity: z
    .enum(["mild", "moderate", "severe"])
    .optional()
    .describe("Severity: mild, moderate, or severe"),
  affected_areas: z
    .array(z.string())
    .optional()
    .describe("Affected muscle groups or body areas"),
  escalation_stage: z
    .enum(["monitor", "reduce_volume", "low_impact_only", "forced_rest"])
    .optional()
    .describe("Protocol stage: monitor, reduce_volume, low_impact_only, forced_rest"),
  notes: z.string().optional().describe("Injury-specific notes"),
});

const healthSchema = z
  .object({
    sleep_quality: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe("Sleep quality (1-5)"),
    energy_level: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe("Energy level (1-5)"),
    soreness_level: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe("Soreness level (1-5)"),
    notes: z.string().optional().describe("Health observation notes"),
  })
  .refine(
    (data) =>
      data.sleep_quality !== undefined ||
      data.energy_level !== undefined ||
      data.soreness_level !== undefined ||
      data.notes !== undefined,
    { message: "Health observations must include at least one field" }
  );

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
    .min(1, "exercises array must have at least one entry when provided")
    .optional()
    .describe("Exercises performed in this session (omit for ad-hoc injury or health-only)"),
  ad_hoc_injury: z
    .boolean()
    .optional()
    .describe("Set true for injury-only logging (no session record created)"),
  injury: injurySchema
    .optional()
    .describe("Injury status data to log atomically with the session"),
  health: healthSchema
    .optional()
    .describe("Health observations (sleep, energy, soreness) for this date"),
}).refine(
  (data) => {
    // Must have exercises OR ad_hoc_injury OR health-only
    if (data.ad_hoc_injury) {
      return data.injury !== undefined;
    }
    if (!data.exercises || data.exercises.length === 0) {
      return data.health !== undefined;
    }
    return true;
  },
  {
    message:
      "Must provide exercises for a session, or set ad_hoc_injury with injury data, or provide health observations",
  }
);

export type LogSessionInput = z.infer<typeof logSessionSchema>;

export async function logSession(
  params: LogSessionInput,
  database: typeof defaultDb = defaultDb,
  sqliteConn: typeof defaultSqlite = defaultSqlite
) {
  try {
    const result = sqliteConn.transaction(() => {
      const now = new Date().toISOString();
      let sessionLogId: number | null = null;
      let entryCount = 0;
      let upserted = false;
      let injuryLogId: number | null = null;
      let healthObservationId: number | null = null;

      // --- Session logging (skip for ad-hoc injury and health-only) ---
      const hasExercises = params.exercises && params.exercises.length > 0;
      const isAdHocInjury = params.ad_hoc_injury === true;
      const isHealthOnly = !hasExercises && !isAdHocInjury && params.health !== undefined;

      if (hasExercises && !isAdHocInjury) {
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

        if (existing) {
          database
            .update(sessionLogs)
            .set({
              rpe: params.rpe ?? null,
              prehabCompleted: params.prehab_completed ?? null,
              notes: params.notes ?? null,
            })
            .where(eq(sessionLogs.id, existing.id))
            .run();

          database
            .delete(sessionLogEntries)
            .where(eq(sessionLogEntries.sessionLogId, existing.id))
            .run();

          sessionLogId = existing.id;
          upserted = true;
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
              createdAt: now,
            })
            .returning()
            .get();

          sessionLogId = inserted.id;
        }

        // Insert exercise entries
        for (const ex of params.exercises!) {
          database
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
            .run();
          entryCount++;
        }
      }

      // --- Injury logging (Story 3.2) ---
      if (params.injury) {
        const injuryInserted = database
          .insert(injuryStatusLog)
          .values({
            date: params.date,
            painLevel: params.injury.pain_level,
            location: params.injury.location,
            triggerExerciseId: params.injury.trigger_exercise_id ?? null,
            severity: params.injury.severity ?? null,
            affectedAreasJson: params.injury.affected_areas
              ? JSON.stringify(params.injury.affected_areas)
              : null,
            escalationStage: params.injury.escalation_stage ?? null,
            notes: params.injury.notes ?? null,
            createdAt: now,
          })
          .returning()
          .get();

        injuryLogId = injuryInserted.id;
      }

      // --- Health observations (Story 3.3) ---
      if (params.health) {
        // Upsert on date (unique constraint)
        const existingHealth = database
          .select({ id: healthObservations.id })
          .from(healthObservations)
          .where(eq(healthObservations.date, params.date))
          .get();

        if (existingHealth) {
          database
            .update(healthObservations)
            .set({
              sleepQuality: params.health.sleep_quality ?? null,
              energyLevel: params.health.energy_level ?? null,
              sorenessLevel: params.health.soreness_level ?? null,
              notes: params.health.notes ?? null,
            })
            .where(eq(healthObservations.id, existingHealth.id))
            .run();

          healthObservationId = existingHealth.id;
        } else {
          const healthInserted = database
            .insert(healthObservations)
            .values({
              date: params.date,
              sleepQuality: params.health.sleep_quality ?? null,
              energyLevel: params.health.energy_level ?? null,
              sorenessLevel: params.health.soreness_level ?? null,
              notes: params.health.notes ?? null,
              createdAt: now,
            })
            .returning()
            .get();

          healthObservationId = healthInserted.id;
        }
      }

      return {
        sessionLogId,
        entryCount,
        upserted,
        injuryLogId,
        healthObservationId,
        isAdHocInjury,
        isHealthOnly,
      };
    })();

    // Build response — omit null/undefined fields per format patterns
    const response: Record<string, unknown> = {
      date: params.date,
    };

    if (result.isAdHocInjury) {
      response.adHocInjury = true;
    } else if (result.isHealthOnly) {
      response.healthOnly = true;
    } else if (result.sessionLogId !== null) {
      response.sessionLogId = result.sessionLogId;
      response.sessionType = params.session_type;
      response.sessionOrder = params.session_order;
      response.entryCount = result.entryCount;
    }

    if (params.rpe !== undefined && !result.isAdHocInjury && !result.isHealthOnly) {
      response.rpe = params.rpe;
    }
    if (params.prehab_completed !== undefined && !result.isAdHocInjury && !result.isHealthOnly) {
      response.prehabCompleted = params.prehab_completed;
    }
    if (result.upserted) {
      response.upserted = true;
    }
    if (result.injuryLogId !== null) {
      response.injuryLogId = result.injuryLogId;
      response.injuryPainLevel = params.injury!.pain_level;
      response.injuryLocation = params.injury!.location;
    }
    if (result.healthObservationId !== null) {
      response.healthObservationId = result.healthObservationId;
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
