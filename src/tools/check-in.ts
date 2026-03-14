import { db as defaultDb } from "../db/connection.js";
import {
  getRecentInjuries,
  getRecentHealth,
  getLastSession,
  getUpcomingPlanPreview,
  getSessionLogsInRange,
  getSkippedSessions,
} from "../db/queries.js";
import { log } from "../lib/logger.js";

const SEVERITY_ALERT_THRESHOLD = 8;

export async function checkIn(database: typeof defaultDb = defaultDb) {
  try {
    const response: Record<string, unknown> = {};

    // --- Injury status (always first per TRAINER.md) ---
    const injuries = getRecentInjuries(database);
    if (injuries.length > 0) {
      response.injuryStatus = injuries.map((inj) => {
        const entry: Record<string, unknown> = {
          date: inj.date,
          painLevel: inj.painLevel,
          location: inj.location,
        };
        if (inj.severity) entry.severity = inj.severity;
        if (inj.escalationStage) entry.escalationStage = inj.escalationStage;
        if (inj.notes) entry.notes = inj.notes;
        return entry;
      });

      // Severity alert (FR34) — check all recent injuries, alert on worst
      const severe = injuries
        .filter((inj) => inj.painLevel >= SEVERITY_ALERT_THRESHOLD)
        .sort((a, b) => b.painLevel - a.painLevel)[0];
      if (severe) {
        response.severityAlert = {
          painLevel: severe.painLevel,
          location: severe.location,
        };
      }
    }

    // --- Recent health observations ---
    const health = getRecentHealth(database);
    if (health.length > 0) {
      response.healthObservations = health.map((h) => {
        const entry: Record<string, unknown> = { date: h.date };
        if (h.sleepQuality !== null) entry.sleepQuality = h.sleepQuality;
        if (h.energyLevel !== null) entry.energyLevel = h.energyLevel;
        if (h.sorenessLevel !== null) entry.sorenessLevel = h.sorenessLevel;
        if (h.notes) entry.notes = h.notes;
        return entry;
      });
    }

    // --- Last session summary ---
    const lastSession = getLastSession(database);
    if (lastSession) {
      const sessionSummary: Record<string, unknown> = {
        date: lastSession.date,
        sessionType: lastSession.sessionType,
        exerciseCount: lastSession.entries.length,
      };
      if (lastSession.rpe !== null) sessionSummary.rpe = lastSession.rpe;
      if (lastSession.prehabCompleted !== null)
        sessionSummary.prehabCompleted = lastSession.prehabCompleted;
      if (lastSession.entries.length > 0) {
        sessionSummary.exercises = lastSession.entries.map((e) => {
          const ex: Record<string, unknown> = {
            name: e.exerciseName,
            sets: e.sets,
            reps: e.reps,
          };
          if (e.weight) ex.weight = e.weight;
          if (e.rpePerExercise !== null) ex.rpe = e.rpePerExercise;
          return ex;
        });
      }
      response.lastSession = sessionSummary;
    }

    // --- Upcoming plan preview ---
    const planPreview = getUpcomingPlanPreview(database);
    if (planPreview) {
      response.upcomingPlan = {
        mesocycleName: planPreview.mesocycleName,
        phase: planPreview.phase,
        weekNumber: planPreview.weekNumber,
        sessions: planPreview.sessions.map((s) => {
          const sess: Record<string, unknown> = {
            sessionType: s.sessionType,
            dayOfWeek: s.dayOfWeek,
          };
          if (s.scheduledStatus) sess.scheduledStatus = s.scheduledStatus;
          if (s.scheduledDatetime) sess.scheduledDatetime = s.scheduledDatetime;
          return sess;
        }),
      };
    }

    // --- Coaching intelligence: skipped sessions (FR32) ---
    const skipped = getSkippedSessions(database);
    if (skipped.length > 0) {
      response.skippedSessions = skipped;
    }

    // --- Coaching intelligence: training load (FR33) ---
    const recentSessions = getSessionLogsInRange(database, 7);
    if (recentSessions.length > 0) {
      const rpeValues = recentSessions
        .filter((s) => s.rpe !== null)
        .map((s) => s.rpe!);
      const avgRpe =
        rpeValues.length > 0
          ? Math.round((rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length) * 10) / 10
          : null;

      // Count rest days (days in past 7 with no sessions)
      const sessionDates = new Set(recentSessions.map((s) => s.date));
      let restDays = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const dateStr = `${y}-${m}-${day}`;
        if (!sessionDates.has(dateStr)) restDays++;
      }

      const trainingLoad: Record<string, unknown> = {
        totalSessions: recentSessions.length,
        restDays,
      };
      if (avgRpe !== null) trainingLoad.averageRpe = avgRpe;
      response.trainingLoad = trainingLoad;
    }

    // If nothing at all, return a friendly message
    if (Object.keys(response).length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              message:
                "No data available yet. Start by creating a training plan or logging a session.",
            }),
          },
        ],
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
    log("error", "check_in", message, undefined, database);
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to check in: ${message}`,
        },
      ],
      isError: true,
    };
  }
}
