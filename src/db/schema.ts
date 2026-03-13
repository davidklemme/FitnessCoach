import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const systemLogs = sqliteTable("system_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: text("timestamp").notNull(),
  level: text("level").notNull(),
  source: text("source").notNull(),
  message: text("message").notNull(),
  metadataJson: text("metadata_json"),
});
