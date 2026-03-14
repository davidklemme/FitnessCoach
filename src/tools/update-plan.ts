import { z } from "zod";
import { db as defaultDb } from "../db/connection.js";
import { sqlite as defaultSqlite } from "../db/connection.js";
import {
  plans,
  planSessions,
  planSessionExercises,
  exercises,
} from "../db/schema.js";
import { eq, and, isNotNull, lte, notInArray } from "drizzle-orm";
import { log } from "../lib/logger.js";

const sessionSchema = z.object({
  session_type: z.string().describe("Session type (e.g. push, pull, legs, full_body)"),
  day_of_week: z.string().describe("Day of week (e.g. monday, wednesday)"),
  exercises: z.array(
    z.object({
      exercise_id: z.number().int().describe("Exercise ID from exercise library"),
      sets: z.number().int().min(1).describe("Number of sets"),
      reps: z.string().describe("Reps target (e.g. '8', '8-12', 'AMRAP')"),
      notes: z.string().optional().describe("Optional notes for this exercise"),
    })
  ).min(1),
});

const createSchema = z.object({
  action: z.literal("create"),
  mesocycle_name: z.string().describe("Name for the mesocycle"),
  phase: z.string().describe("Current phase (e.g. progressive_overload, base, peak)"),
  week_number: z.number().int().min(1).describe("Current week number"),
  start_date: z.string().describe("Plan start date (YYYY-MM-DD)"),
  end_date: z.string().optional().describe("Plan end date (YYYY-MM-DD)"),
  sessions: z.array(sessionSchema).min(1).describe("Planned sessions"),
});

const swapExerciseSchema = z.object({
  action: z.literal("swap_exercise"),
  plan_session_id: z.number().int().describe("Plan session ID"),
  old_exercise_id: z.number().int().describe("Exercise ID to replace"),
  new_exercise_id: z.number().int().describe("Replacement exercise ID"),
});

const adjustVolumeSchema = z.object({
  action: z.literal("adjust_volume"),
  plan_session_exercise_id: z.number().int().describe("Plan session exercise entry ID"),
  sets: z.number().int().min(1).optional().describe("New sets count"),
  reps: z.string().optional().describe("New reps target"),
});

const deloadSchema = z.object({
  action: z.literal("deload"),
});

const injuryAdjustSchema = z.object({
  action: z.literal("injury_adjust"),
  affected_areas: z.array(z.string()).min(1).describe("Muscle groups affected by injury (e.g. chest, quads, biceps)"),
  pain_level: z.number().int().min(0).max(10).describe("Pain level 0-10"),
});

const scheduleConfirmSchema = z.object({
  action: z.literal("schedule_confirm"),
  confirmations: z.array(z.object({
    plan_session_id: z.number().int().describe("Plan session ID"),
    datetime: z.string().describe("Scheduled datetime (ISO 8601)"),
    calendar_event_id: z.string().describe("Google Calendar event ID"),
  })).min(1).describe("Sessions to confirm with calendar event references"),
});

const scheduleCancelSchema = z.object({
  action: z.literal("schedule_cancel"),
  plan_session_id: z.number().int().describe("Plan session ID to cancel scheduling for"),
});

const scheduleRejectSchema = z.object({
  action: z.literal("schedule_reject"),
});

export const updatePlanSchema = z.discriminatedUnion("action", [
  createSchema,
  swapExerciseSchema,
  adjustVolumeSchema,
  deloadSchema,
  injuryAdjustSchema,
  scheduleConfirmSchema,
  scheduleCancelSchema,
  scheduleRejectSchema,
]);

export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export async function updatePlan(
  params: UpdatePlanInput,
  database: typeof defaultDb = defaultDb,
  sqliteConn: typeof defaultSqlite = defaultSqlite
) {
  try {
    switch (params.action) {
      case "create":
        return handleCreate(params, database, sqliteConn);
      case "swap_exercise":
        return handleSwapExercise(params, database);
      case "adjust_volume":
        return handleAdjustVolume(params, database);
      case "deload":
        return handleDeload(params, database, sqliteConn);
      case "injury_adjust":
        return handleInjuryAdjust(params, database, sqliteConn);
      case "schedule_confirm":
        return handleScheduleConfirm(params, database, sqliteConn);
      case "schedule_cancel":
        return handleScheduleCancel(params, database, sqliteConn);
      case "schedule_reject":
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ scheduleReject: { message: "Schedule rejected. No changes made to plan." } }),
            },
          ],
        };
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    log("error", "update_plan", message, { action: params.action }, database);
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to update plan: ${message}`,
        },
      ],
      isError: true,
    };
  }
}

function handleCreate(
  params: z.infer<typeof createSchema>,
  database: typeof defaultDb,
  sqliteConn: typeof defaultSqlite
) {
  const result = sqliteConn.transaction(() => {
    // Deactivate any existing active plans before creating new one
    database
      .update(plans)
      .set({ status: "completed" })
      .where(eq(plans.status, "active"))
      .run();

    const plan = database
      .insert(plans)
      .values({
        mesocycleName: params.mesocycle_name,
        phase: params.phase,
        weekNumber: params.week_number,
        status: "active",
        startDate: params.start_date,
        endDate: params.end_date ?? null,
        createdAt: new Date().toISOString(),
      })
      .returning()
      .get();

    const createdSessions = [];

    for (const session of params.sessions) {
      const planSession = database
        .insert(planSessions)
        .values({
          planId: plan.id,
          sessionType: session.session_type,
          dayOfWeek: session.day_of_week,
        })
        .returning()
        .get();

      const exerciseEntries = [];
      for (const ex of session.exercises) {
        const entry = database
          .insert(planSessionExercises)
          .values({
            planSessionId: planSession.id,
            exerciseId: ex.exercise_id,
            sets: ex.sets,
            reps: ex.reps,
            notes: ex.notes ?? null,
          })
          .returning()
          .get();
        exerciseEntries.push(entry);
      }

      createdSessions.push({
        id: planSession.id,
        sessionType: planSession.sessionType,
        dayOfWeek: planSession.dayOfWeek,
        exerciseCount: exerciseEntries.length,
      });
    }

    return { plan, sessions: createdSessions };
  })();

  const response: Record<string, unknown> = {
    id: result.plan.id,
    mesocycleName: result.plan.mesocycleName,
    phase: result.plan.phase,
    weekNumber: result.plan.weekNumber,
    status: result.plan.status,
    startDate: result.plan.startDate,
    createdAt: result.plan.createdAt,
    sessions: result.sessions,
  };
  if (result.plan.endDate) {
    response.endDate = result.plan.endDate;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(response),
      },
    ],
  };
}

function handleSwapExercise(
  params: z.infer<typeof swapExerciseSchema>,
  database: typeof defaultDb
) {
  // Verify session belongs to active plan
  const session = database
    .select({ id: planSessions.id, planId: planSessions.planId })
    .from(planSessions)
    .innerJoin(plans, eq(plans.id, planSessions.planId))
    .where(
      and(
        eq(planSessions.id, params.plan_session_id),
        eq(plans.status, "active")
      )
    )
    .get();

  if (!session) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Session ${params.plan_session_id} not found in active plan. Use get_current_plan to see current sessions.`,
        },
      ],
      isError: true,
    };
  }

  // Validate new exercise exists
  const newExercise = database
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(eq(exercises.id, params.new_exercise_id))
    .get();

  if (!newExercise) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Exercise ID ${params.new_exercise_id} not found in exercise library. Use get_exercise_library to browse available exercises.`,
        },
      ],
      isError: true,
    };
  }

  // Find the entry to swap
  const entry = database
    .select()
    .from(planSessionExercises)
    .where(
      and(
        eq(planSessionExercises.planSessionId, params.plan_session_id),
        eq(planSessionExercises.exerciseId, params.old_exercise_id)
      )
    )
    .get();

  if (!entry) {
    // Check if already swapped (idempotent — NFR3)
    const alreadySwapped = database
      .select()
      .from(planSessionExercises)
      .where(
        and(
          eq(planSessionExercises.planSessionId, params.plan_session_id),
          eq(planSessionExercises.exerciseId, params.new_exercise_id)
        )
      )
      .get();

    if (alreadySwapped) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              swapped: {
                planSessionExerciseId: alreadySwapped.id,
                oldExerciseId: params.old_exercise_id,
                newExerciseId: params.new_exercise_id,
                newExerciseName: newExercise.name,
                alreadyApplied: true,
              },
            }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `No exercise entry found for session ${params.plan_session_id} with exercise ID ${params.old_exercise_id}. Use get_current_plan to see current assignments.`,
        },
      ],
      isError: true,
    };
  }

  database
    .update(planSessionExercises)
    .set({ exerciseId: params.new_exercise_id })
    .where(eq(planSessionExercises.id, entry.id))
    .run();

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          swapped: {
            planSessionExerciseId: entry.id,
            oldExerciseId: params.old_exercise_id,
            newExerciseId: params.new_exercise_id,
            newExerciseName: newExercise.name,
          },
        }),
      },
    ],
  };
}

function handleAdjustVolume(
  params: z.infer<typeof adjustVolumeSchema>,
  database: typeof defaultDb
) {
  // Verify entry exists and belongs to active plan
  const entry = database
    .select({
      id: planSessionExercises.id,
      sets: planSessionExercises.sets,
      reps: planSessionExercises.reps,
    })
    .from(planSessionExercises)
    .innerJoin(planSessions, eq(planSessions.id, planSessionExercises.planSessionId))
    .innerJoin(plans, eq(plans.id, planSessions.planId))
    .where(
      and(
        eq(planSessionExercises.id, params.plan_session_exercise_id),
        eq(plans.status, "active")
      )
    )
    .get();

  if (!entry) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Plan session exercise ID ${params.plan_session_exercise_id} not found in active plan. Use get_current_plan to see current exercise entries.`,
        },
      ],
      isError: true,
    };
  }

  const updates: { sets?: number; reps?: string } = {};
  if (params.sets !== undefined) updates.sets = params.sets;
  if (params.reps !== undefined) updates.reps = params.reps;

  if (Object.keys(updates).length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: "No volume changes specified. Provide sets, reps, or both.",
        },
      ],
      isError: true,
    };
  }

  database
    .update(planSessionExercises)
    .set(updates)
    .where(eq(planSessionExercises.id, params.plan_session_exercise_id))
    .run();

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          updated: {
            planSessionExerciseId: params.plan_session_exercise_id,
            ...updates,
          },
        }),
      },
    ],
  };
}

function handleDeload(
  params: z.infer<typeof deloadSchema>,
  database: typeof defaultDb,
  sqliteConn: typeof defaultSqlite
) {
  const result = sqliteConn.transaction(() => {
    const activePlan = database
      .select()
      .from(plans)
      .where(eq(plans.status, "active"))
      .get();

    if (!activePlan) {
      return { error: "no_active_plan" as const };
    }

    // Update plan phase to deload
    database
      .update(plans)
      .set({ phase: "deload" })
      .where(eq(plans.id, activePlan.id))
      .run();

    // Get all exercises in this plan's sessions
    const allExercises = database
      .select({
        id: planSessionExercises.id,
        sets: planSessionExercises.sets,
      })
      .from(planSessionExercises)
      .innerJoin(
        planSessions,
        eq(planSessions.id, planSessionExercises.planSessionId)
      )
      .where(eq(planSessions.planId, activePlan.id))
      .all();

    for (const ex of allExercises) {
      const newSets = Math.max(1, Math.round(ex.sets * 0.5));
      database
        .update(planSessionExercises)
        .set({ sets: newSets })
        .where(eq(planSessionExercises.id, ex.id))
        .run();
    }

    return { planId: activePlan.id, adjustedCount: allExercises.length };
  })();

  if ("error" in result) {
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

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          deload: {
            planId: result.planId,
            phase: "deload",
            exercisesAdjusted: result.adjustedCount,
          },
        }),
      },
    ],
  };
}

// Maximum joint stress rating for injury substitution candidates.
// Exercises at or below this threshold are considered safe alternatives.
const INJURY_SUBSTITUTE_MAX_JOINT_STRESS = 3;

function handleInjuryAdjust(
  params: z.infer<typeof injuryAdjustSchema>,
  database: typeof defaultDb,
  sqliteConn: typeof defaultSqlite
) {
  // Pain level 0 = restore original exercises for the specified areas
  if (params.pain_level === 0) {
    return handleInjuryRestore(params.affected_areas, database, sqliteConn);
  }

  const result = sqliteConn.transaction(() => {
    const activePlan = database
      .select()
      .from(plans)
      .where(eq(plans.status, "active"))
      .get();

    if (!activePlan) {
      return { error: "no_active_plan" as const };
    }

    // Get all exercises in the active plan with their exercise metadata
    const planExercises = database
      .select({
        entryId: planSessionExercises.id,
        exerciseId: planSessionExercises.exerciseId,
        exerciseName: exercises.name,
        originalExerciseId: planSessionExercises.originalExerciseId,
        planSessionId: planSessionExercises.planSessionId,
        sessionType: planSessions.sessionType,
        muscleGroups: exercises.muscleGroups,
      })
      .from(planSessionExercises)
      .innerJoin(
        planSessions,
        eq(planSessions.id, planSessionExercises.planSessionId)
      )
      .innerJoin(exercises, eq(exercises.id, planSessionExercises.exerciseId))
      .where(eq(planSessions.planId, activePlan.id))
      .all();

    const substitutions: {
      entryId: number;
      planSessionId: number;
      oldExerciseId: number;
      oldExerciseName: string;
      newExerciseId: number;
      newExerciseName: string;
    }[] = [];
    const flaggedSessions: {
      planSessionId: number;
      sessionType: string;
      exerciseId: number;
      exerciseName: string;
      reason: string;
    }[] = [];

    // Track substitute IDs assigned during this call to avoid duplicates within a session
    const assignedSubstitutes = new Map<number, Set<number>>();

    for (const entry of planExercises) {
      const entryMuscleGroups: string[] = JSON.parse(entry.muscleGroups);

      // Check if this exercise targets any affected areas
      const isAffected = params.affected_areas.some((area) =>
        entryMuscleGroups.some(
          (mg) => mg.toLowerCase() === area.toLowerCase()
        )
      );

      if (!isAffected) continue;

      // Already substituted from a prior injury_adjust — skip
      if (entry.originalExerciseId !== null) continue;

      // Collect exercise IDs already in this session to avoid duplicates
      const sessionExerciseIds = planExercises
        .filter((pe) => pe.planSessionId === entry.planSessionId)
        .map((pe) => pe.exerciseId);

      // Also exclude substitutes already assigned in this call
      const alreadyAssigned = assignedSubstitutes.get(entry.planSessionId);
      const excludeIds = [...sessionExerciseIds];
      if (alreadyAssigned) {
        excludeIds.push(...alreadyAssigned);
      }

      // Find alternative: low joint stress, doesn't target affected areas
      const candidates = database
        .select()
        .from(exercises)
        .where(
          and(
            lte(exercises.jointStressRating, INJURY_SUBSTITUTE_MAX_JOINT_STRESS),
            ...(excludeIds.length > 0
              ? [notInArray(exercises.id, excludeIds)]
              : [])
          )
        )
        .all();

      // Filter out candidates that target affected areas
      const safeCandidate = candidates.find((c) => {
        const candidateMuscles: string[] = JSON.parse(c.muscleGroups);
        return !params.affected_areas.some((area) =>
          candidateMuscles.some(
            (mg) => mg.toLowerCase() === area.toLowerCase()
          )
        );
      });

      if (!safeCandidate) {
        flaggedSessions.push({
          planSessionId: entry.planSessionId,
          sessionType: entry.sessionType,
          exerciseId: entry.exerciseId,
          exerciseName: entry.exerciseName,
          reason: "No suitable low-stress alternative found",
        });
        continue;
      }

      // Apply substitution: store original, swap to alternative
      database
        .update(planSessionExercises)
        .set({
          exerciseId: safeCandidate.id,
          originalExerciseId: entry.exerciseId,
        })
        .where(eq(planSessionExercises.id, entry.entryId))
        .run();

      // Track this substitute so it's not reused in the same session
      if (!assignedSubstitutes.has(entry.planSessionId)) {
        assignedSubstitutes.set(entry.planSessionId, new Set());
      }
      assignedSubstitutes.get(entry.planSessionId)!.add(safeCandidate.id);

      substitutions.push({
        entryId: entry.entryId,
        planSessionId: entry.planSessionId,
        oldExerciseId: entry.exerciseId,
        oldExerciseName: entry.exerciseName,
        newExerciseId: safeCandidate.id,
        newExerciseName: safeCandidate.name,
      });
    }

    return {
      planId: activePlan.id,
      substitutions,
      flaggedSessions,
    };
  })();

  if ("error" in result) {
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

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          injuryAdjust: {
            planId: result.planId,
            affectedAreas: params.affected_areas,
            painLevel: params.pain_level,
            substitutions: result.substitutions,
            flaggedSessions: result.flaggedSessions,
          },
        }),
      },
    ],
  };
}

function handleInjuryRestore(
  affectedAreas: string[],
  database: typeof defaultDb,
  sqliteConn: typeof defaultSqlite
) {
  const result = sqliteConn.transaction(() => {
    const activePlan = database
      .select()
      .from(plans)
      .where(eq(plans.status, "active"))
      .get();

    if (!activePlan) {
      return { error: "no_active_plan" as const };
    }

    // Find all entries with original_exercise_id set (injury-substituted)
    // Join to the ORIGINAL exercise to check if it targets the affected areas
    const substituted = database
      .select({
        entryId: planSessionExercises.id,
        currentExerciseId: planSessionExercises.exerciseId,
        originalExerciseId: planSessionExercises.originalExerciseId,
        originalMuscleGroups: exercises.muscleGroups,
      })
      .from(planSessionExercises)
      .innerJoin(
        planSessions,
        eq(planSessions.id, planSessionExercises.planSessionId)
      )
      .innerJoin(
        exercises,
        eq(exercises.id, planSessionExercises.originalExerciseId)
      )
      .where(
        and(
          eq(planSessions.planId, activePlan.id),
          isNotNull(planSessionExercises.originalExerciseId)
        )
      )
      .all();

    // Only restore entries whose original exercise targeted the cleared areas
    let restoredCount = 0;
    for (const entry of substituted) {
      const originalMuscles: string[] = JSON.parse(entry.originalMuscleGroups);
      const wasAffected = affectedAreas.some((area) =>
        originalMuscles.some(
          (mg) => mg.toLowerCase() === area.toLowerCase()
        )
      );

      if (!wasAffected) continue;

      database
        .update(planSessionExercises)
        .set({
          exerciseId: entry.originalExerciseId!,
          originalExerciseId: null,
        })
        .where(eq(planSessionExercises.id, entry.entryId))
        .run();
      restoredCount++;
    }

    return { planId: activePlan.id, restoredCount };
  })();

  if ("error" in result) {
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

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          injuryRestore: {
            planId: result.planId,
            restoredCount: result.restoredCount,
          },
        }),
      },
    ],
  };
}

function handleScheduleConfirm(
  params: z.infer<typeof scheduleConfirmSchema>,
  database: typeof defaultDb,
  sqliteConn: typeof defaultSqlite
) {
  const result = sqliteConn.transaction(() => {
    const activePlan = database
      .select()
      .from(plans)
      .where(eq(plans.status, "active"))
      .get();

    if (!activePlan) {
      return { error: "no_active_plan" as const };
    }

    const confirmed: { planSessionId: number; datetime: string; calendarEventId: string; replacedCalendarEventId?: string }[] = [];
    const failed: { planSessionId: number; reason: string }[] = [];

    for (const conf of params.confirmations) {
      const session = database
        .select({ id: planSessions.id, calendarEventId: planSessions.calendarEventId })
        .from(planSessions)
        .where(
          and(
            eq(planSessions.id, conf.plan_session_id),
            eq(planSessions.planId, activePlan.id)
          )
        )
        .get();

      if (!session) {
        failed.push({ planSessionId: conf.plan_session_id, reason: "Session not found in active plan" });
        continue;
      }

      database
        .update(planSessions)
        .set({
          scheduledStatus: "confirmed",
          scheduledDatetime: conf.datetime,
          calendarEventId: conf.calendar_event_id,
        })
        .where(eq(planSessions.id, conf.plan_session_id))
        .run();

      const entry: Record<string, unknown> = {
        planSessionId: conf.plan_session_id,
        datetime: conf.datetime,
        calendarEventId: conf.calendar_event_id,
      };
      // Return replaced event ID so Claude can clean up the orphaned calendar event
      if (session.calendarEventId && session.calendarEventId !== conf.calendar_event_id) {
        entry.replacedCalendarEventId = session.calendarEventId;
      }
      confirmed.push(entry as typeof confirmed[number]);
    }

    return { planId: activePlan.id, confirmed, failed };
  })();

  if ("error" in result) {
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

  const response: Record<string, unknown> = {
    scheduleConfirm: {
      planId: result.planId,
      confirmed: result.confirmed,
    },
  };
  if (result.failed.length > 0) {
    (response.scheduleConfirm as Record<string, unknown>).failed = result.failed;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(response),
      },
    ],
  };
}

function handleScheduleCancel(
  params: z.infer<typeof scheduleCancelSchema>,
  database: typeof defaultDb,
  sqliteConn: typeof defaultSqlite
) {
  const result = sqliteConn.transaction(() => {
    const session = database
      .select({
        id: planSessions.id,
        scheduledStatus: planSessions.scheduledStatus,
        calendarEventId: planSessions.calendarEventId,
      })
      .from(planSessions)
      .innerJoin(plans, eq(plans.id, planSessions.planId))
      .where(
        and(
          eq(planSessions.id, params.plan_session_id),
          eq(plans.status, "active")
        )
      )
      .get();

    if (!session) {
      return { error: "not_found" as const };
    }

    if (!session.scheduledStatus) {
      return { error: "not_scheduled" as const };
    }

    const oldEventId = session.calendarEventId;

    database
      .update(planSessions)
      .set({
        scheduledStatus: null,
        scheduledDatetime: null,
        calendarEventId: null,
      })
      .where(eq(planSessions.id, params.plan_session_id))
      .run();

    return { oldEventId };
  })();

  if ("error" in result) {
    if (result.error === "not_found") {
      return {
        content: [
          {
            type: "text" as const,
            text: `Session ${params.plan_session_id} not found in active plan.`,
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            scheduleCancel: {
              planSessionId: params.plan_session_id,
              cleared: false,
              message: "Session is not currently scheduled.",
            },
          }),
        },
      ],
    };
  }

  const response: Record<string, unknown> = {
    scheduleCancel: {
      planSessionId: params.plan_session_id,
      cleared: true,
    },
  };
  if (result.oldEventId) {
    (response.scheduleCancel as Record<string, unknown>).orphanedCalendarEventId = result.oldEventId;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(response),
      },
    ],
  };
}
