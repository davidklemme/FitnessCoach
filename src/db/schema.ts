import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

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
