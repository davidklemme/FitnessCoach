import { db as defaultDb } from "../db/connection.js";
import { systemLogs } from "../db/schema.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export function log(
  level: LogLevel,
  source: string,
  message: string,
  metadata?: Record<string, unknown>,
  database: typeof defaultDb = defaultDb
) {
  try {
    database
      .insert(systemLogs)
      .values({
        timestamp: new Date().toISOString(),
        level,
        source,
        message,
        metadataJson: metadata ? JSON.stringify(metadata) : null,
      })
      .run();
  } catch (err) {
    // Last resort — never let logging crash the caller
    console.error(
      `[logger] Failed to write log: ${level} ${source} ${String(err)}`
    );
  }
}
