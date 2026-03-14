import { db as defaultDb } from "../db/connection.js";
import {
  plans,
  planSessions,
  planSessionExercises,
  exercises,
  schedulingPreferences,
} from "../db/schema.js";
import { eq } from "drizzle-orm";
import { log } from "../lib/logger.js";

export async function getCurrentPlan(database: typeof defaultDb = defaultDb) {
  try {
    const activePlans = database
      .select()
      .from(plans)
      .where(eq(plans.status, "active"))
      .all();

    if (activePlans.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No active plan found. Use update_plan with action: 'create' to create one.",
          },
        ],
        isError: true,
      };
    }

    if (activePlans.length > 1) {
      log(
        "warn",
        "get_current_plan",
        `Multiple active plans found (${activePlans.length}). Returning most recent.`,
        undefined,
        database
      );
    }

    // Most recently created active plan
    const activePlan = activePlans.sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    )[0];

    const rows = database
      .select({
        sessionId: planSessions.id,
        sessionType: planSessions.sessionType,
        dayOfWeek: planSessions.dayOfWeek,
        scheduledStatus: planSessions.scheduledStatus,
        calendarEventId: planSessions.calendarEventId,
        scheduledDatetime: planSessions.scheduledDatetime,
        exerciseEntryId: planSessionExercises.id,
        exerciseName: exercises.name,
        exerciseLocationType: exercises.locationType,
        exerciseEquipment: exercises.equipmentRequired,
        exerciseMinDuration: exercises.minDuration,
        sets: planSessionExercises.sets,
        reps: planSessionExercises.reps,
        notes: planSessionExercises.notes,
        originalExerciseId: planSessionExercises.originalExerciseId,
      })
      .from(planSessions)
      .leftJoin(
        planSessionExercises,
        eq(planSessionExercises.planSessionId, planSessions.id)
      )
      .leftJoin(exercises, eq(exercises.id, planSessionExercises.exerciseId))
      .where(eq(planSessions.planId, activePlan.id))
      .all();

    // Group exercises by session
    const sessionMap = new Map<
      number,
      {
        id: number;
        sessionType: string;
        dayOfWeek: string;
        scheduledStatus?: string;
        calendarEventId?: string;
        scheduledDatetime?: string;
        estimatedDuration: number;
        locationTypes: Set<string>;
        equipmentNeeded: Set<string>;
        exercises: Record<string, unknown>[];
      }
    >();

    const WARMUP_COOLDOWN_MINUTES = 10;
    const TRANSITION_MINUTES = 5;

    for (const row of rows) {
      if (!sessionMap.has(row.sessionId)) {
        const session: {
          id: number;
          sessionType: string;
          dayOfWeek: string;
          scheduledStatus?: string;
          calendarEventId?: string;
          scheduledDatetime?: string;
          estimatedDuration: number;
          locationTypes: Set<string>;
          equipmentNeeded: Set<string>;
          exercises: Record<string, unknown>[];
        } = {
          id: row.sessionId,
          sessionType: row.sessionType,
          dayOfWeek: row.dayOfWeek,
          estimatedDuration: WARMUP_COOLDOWN_MINUTES,
          locationTypes: new Set(),
          equipmentNeeded: new Set(),
          exercises: [],
        };
        if (row.scheduledStatus) session.scheduledStatus = row.scheduledStatus;
        if (row.calendarEventId) session.calendarEventId = row.calendarEventId;
        if (row.scheduledDatetime) session.scheduledDatetime = row.scheduledDatetime;
        sessionMap.set(row.sessionId, session);
      }

      // LEFT JOIN — exercise fields are null when session has no exercises
      if (row.exerciseEntryId != null) {
        const exercise: Record<string, unknown> = {
          id: row.exerciseEntryId,
          name: row.exerciseName,
          sets: row.sets,
          reps: row.reps,
        };

        if (row.notes) {
          exercise.notes = row.notes;
        }

        if (row.originalExerciseId) {
          exercise.originalExerciseId = row.originalExerciseId;
        }

        const sess = sessionMap.get(row.sessionId)!;
        sess.exercises.push(exercise);

        // Accumulate scheduling context from exercise metadata
        if (row.exerciseMinDuration) {
          // Transition time only between exercises (N-1 transitions for N exercises)
          const transition = sess.exercises.length > 1 ? TRANSITION_MINUTES : 0;
          sess.estimatedDuration += row.exerciseMinDuration + transition;
        }
        if (row.exerciseLocationType) {
          sess.locationTypes.add(row.exerciseLocationType);
        }
        if (row.exerciseEquipment) {
          try {
            const equip: string[] = JSON.parse(row.exerciseEquipment);
            for (const e of equip) {
              if (e !== "none") sess.equipmentNeeded.add(e);
            }
          } catch {
            // ignore malformed JSON
          }
        }
      }
    }

    // Serialize sessions with scheduling context
    const sessions = Array.from(sessionMap.values()).map((s) => {
      const session: Record<string, unknown> = {
        id: s.id,
        sessionType: s.sessionType,
        dayOfWeek: s.dayOfWeek,
        estimatedDuration: s.exercises.length > 0 ? s.estimatedDuration : 0,
        locationTypes: Array.from(s.locationTypes),
        equipmentNeeded: Array.from(s.equipmentNeeded),
        exercises: s.exercises,
      };
      if (s.scheduledStatus) session.scheduledStatus = s.scheduledStatus;
      if (s.calendarEventId) session.calendarEventId = s.calendarEventId;
      if (s.scheduledDatetime) session.scheduledDatetime = s.scheduledDatetime;
      return session;
    });

    const result: Record<string, unknown> = {
      id: activePlan.id,
      mesocycleName: activePlan.mesocycleName,
      phase: activePlan.phase,
      weekNumber: activePlan.weekNumber,
      status: activePlan.status,
      startDate: activePlan.startDate,
      createdAt: activePlan.createdAt,
      sessions,
    };

    if (activePlan.endDate) {
      result.endDate = activePlan.endDate;
    }

    // Include scheduling preferences if configured
    const prefs = database.select().from(schedulingPreferences).get();
    if (prefs) {
      const scheduling: Record<string, unknown> = {
        earliestTime: prefs.earliestTime,
        latestTime: prefs.latestTime,
        meetingBufferMinutes: prefs.meetingBufferMinutes,
      };
      if (prefs.blackoutPatternsJson) {
        try {
          scheduling.blackoutPatterns = JSON.parse(prefs.blackoutPatternsJson);
        } catch {
          scheduling.blackoutPatternsRaw = prefs.blackoutPatternsJson;
        }
      }
      result.schedulingPreferences = scheduling;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result),
        },
      ],
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    log("error", "get_current_plan", message, undefined, database);
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to retrieve current plan: ${message}`,
        },
      ],
      isError: true,
    };
  }
}
