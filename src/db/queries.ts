import { db as defaultDb } from "./connection.js";
import {
  plans,
  planSessions,
  planSessionExercises,
  exercises,
  sessionLogs,
  sessionLogEntries,
  injuryStatusLog,
  healthObservations,
} from "./schema.js";
import { eq, desc, gte } from "drizzle-orm";

/** Format a Date as YYYY-MM-DD in local time (matches session date storage). */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Get the most recent injury status log entries.
 */
export function getRecentInjuries(
  database: typeof defaultDb = defaultDb,
  limit = 5
) {
  return database
    .select({
      id: injuryStatusLog.id,
      date: injuryStatusLog.date,
      painLevel: injuryStatusLog.painLevel,
      location: injuryStatusLog.location,
      severity: injuryStatusLog.severity,
      escalationStage: injuryStatusLog.escalationStage,
      notes: injuryStatusLog.notes,
    })
    .from(injuryStatusLog)
    .orderBy(desc(injuryStatusLog.date), desc(injuryStatusLog.id))
    .limit(limit)
    .all();
}

/**
 * Get recent health observations.
 */
export function getRecentHealth(
  database: typeof defaultDb = defaultDb,
  limit = 7
) {
  return database
    .select()
    .from(healthObservations)
    .orderBy(desc(healthObservations.date))
    .limit(limit)
    .all();
}

/**
 * Get the most recent session log with its entries.
 */
export function getLastSession(database: typeof defaultDb = defaultDb) {
  const session = database
    .select()
    .from(sessionLogs)
    .orderBy(desc(sessionLogs.date), desc(sessionLogs.id))
    .limit(1)
    .get();

  if (!session) return null;

  const entries = database
    .select({
      exerciseId: sessionLogEntries.exerciseId,
      exerciseName: exercises.name,
      sets: sessionLogEntries.sets,
      reps: sessionLogEntries.reps,
      weight: sessionLogEntries.weight,
      rpePerExercise: sessionLogEntries.rpePerExercise,
    })
    .from(sessionLogEntries)
    .innerJoin(exercises, eq(exercises.id, sessionLogEntries.exerciseId))
    .where(eq(sessionLogEntries.sessionLogId, session.id))
    .all();

  return { ...session, entries };
}

/**
 * Get all sessions from the active plan.
 */
export function getUpcomingPlanPreview(database: typeof defaultDb = defaultDb) {
  const activePlan = database
    .select()
    .from(plans)
    .where(eq(plans.status, "active"))
    .limit(1)
    .get();

  if (!activePlan) return null;

  const sessions = database
    .select({
      id: planSessions.id,
      sessionType: planSessions.sessionType,
      dayOfWeek: planSessions.dayOfWeek,
      scheduledStatus: planSessions.scheduledStatus,
      scheduledDatetime: planSessions.scheduledDatetime,
    })
    .from(planSessions)
    .where(eq(planSessions.planId, activePlan.id))
    .all();

  return {
    planId: activePlan.id,
    mesocycleName: activePlan.mesocycleName,
    phase: activePlan.phase,
    weekNumber: activePlan.weekNumber,
    sessions,
  };
}

/**
 * Get session logs from the past N days.
 */
export function getSessionLogsInRange(
  database: typeof defaultDb = defaultDb,
  days = 7
) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = toLocalDateStr(cutoff);

  return database
    .select()
    .from(sessionLogs)
    .where(gte(sessionLogs.date, cutoffStr))
    .orderBy(desc(sessionLogs.date))
    .all();
}

/**
 * Get planned sessions from active plan that were not logged in the past N days.
 */
export function getSkippedSessions(
  database: typeof defaultDb = defaultDb,
  days = 7
) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = toLocalDateStr(cutoff);

  const activePlan = database
    .select()
    .from(plans)
    .where(eq(plans.status, "active"))
    .limit(1)
    .get();

  if (!activePlan) return [];

  const planned = database
    .select({
      sessionType: planSessions.sessionType,
      dayOfWeek: planSessions.dayOfWeek,
    })
    .from(planSessions)
    .where(eq(planSessions.planId, activePlan.id))
    .all();

  const logged = database
    .select({
      date: sessionLogs.date,
      sessionType: sessionLogs.sessionType,
    })
    .from(sessionLogs)
    .where(gte(sessionLogs.date, cutoffStr))
    .all();

  // Build set of logged (date, session_type) tuples
  const loggedSet = new Set(logged.map((l) => `${l.date}|${l.sessionType}`));

  // Check each past day (excluding today — today's sessions are still upcoming)
  const skipped: { date: string; sessionType: string; dayOfWeek: string }[] = [];
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const todayStr = toLocalDateStr(new Date());

  for (let i = days; i >= 1; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = toLocalDateStr(d);
    const dayOfWeek = dayNames[d.getDay()];

    for (const p of planned) {
      if (p.dayOfWeek.toLowerCase() === dayOfWeek) {
        if (!loggedSet.has(`${dateStr}|${p.sessionType}`)) {
          skipped.push({ date: dateStr, sessionType: p.sessionType, dayOfWeek });
        }
      }
    }
  }

  return skipped;
}
