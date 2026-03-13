import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const systemLogs = sqliteTable("system_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: text("timestamp").notNull(),
  level: text("level").notNull(),
  source: text("source").notNull(),
  message: text("message").notNull(),
  metadataJson: text("metadata_json"),
});

export const exercises = sqliteTable("exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  locationType: text("location_type").notNull(),
  equipmentRequired: text("equipment_required").notNull(),
  minDuration: integer("min_duration").notNull(),
  jointStressRating: integer("joint_stress_rating").notNull(),
  muscleGroups: text("muscle_groups").notNull(),
  progressionLadder: text("progression_ladder"),
});

export const plans = sqliteTable("plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mesocycleName: text("mesocycle_name").notNull(),
  phase: text("phase").notNull(),
  weekNumber: integer("week_number").notNull(),
  status: text("status").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  createdAt: text("created_at").notNull(),
});

export const planSessions = sqliteTable(
  "plan_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    planId: integer("plan_id")
      .notNull()
      .references(() => plans.id),
    sessionType: text("session_type").notNull(),
    dayOfWeek: text("day_of_week").notNull(),
  },
  (table) => [index("idx_plan_sessions_plan_id").on(table.planId)]
);

export const planSessionExercises = sqliteTable(
  "plan_session_exercises",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    planSessionId: integer("plan_session_id")
      .notNull()
      .references(() => planSessions.id),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id),
    originalExerciseId: integer("original_exercise_id").references(
      () => exercises.id
    ),
    sets: integer("sets").notNull(),
    reps: text("reps").notNull(),
    notes: text("notes"),
  },
  (table) => [
    index("idx_plan_session_exercises_session_id").on(table.planSessionId),
    index("idx_plan_session_exercises_exercise_id").on(table.exerciseId),
  ]
);

export const sessionLogs = sqliteTable(
  "session_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    sessionType: text("session_type").notNull(),
    sessionOrder: integer("session_order").notNull().default(1),
    rpe: integer("rpe"),
    prehabCompleted: integer("prehab_completed", { mode: "boolean" }),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_session_logs_unique").on(
      table.date,
      table.sessionType,
      table.sessionOrder
    ),
  ]
);

export const sessionLogEntries = sqliteTable(
  "session_log_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionLogId: integer("session_log_id")
      .notNull()
      .references(() => sessionLogs.id),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id),
    sets: integer("sets").notNull(),
    reps: text("reps").notNull(),
    weight: text("weight"),
    rpePerExercise: integer("rpe_per_exercise"),
    notes: text("notes"),
  },
  (table) => [
    index("idx_session_log_entries_session_log_id").on(table.sessionLogId),
    index("idx_session_log_entries_exercise_id").on(table.exerciseId),
  ]
);

export const injuryStatusLog = sqliteTable(
  "injury_status_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    painLevel: integer("pain_level").notNull(),
    location: text("location").notNull(),
    triggerExerciseId: integer("trigger_exercise_id").references(
      () => exercises.id
    ),
    severity: text("severity"),
    affectedAreasJson: text("affected_areas_json"),
    escalationStage: text("escalation_stage"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_injury_status_log_date").on(table.date),
    index("idx_injury_status_log_trigger_exercise_id").on(
      table.triggerExerciseId
    ),
  ]
);

export const healthObservations = sqliteTable(
  "health_observations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull().unique(),
    sleepQuality: integer("sleep_quality"),
    energyLevel: integer("energy_level"),
    sorenessLevel: integer("soreness_level"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_health_observations_date").on(table.date)]
);
