import { statSync } from "node:fs";
import { db as defaultDb } from "../db/connection.js";
import { systemLogs } from "../db/schema.js";
import { config as defaultConfig } from "../config.js";
import { desc, sql } from "drizzle-orm";
import { log } from "../lib/logger.js";

let serverStartTime = Date.now();

export function setServerStartTime(time: number) {
  serverStartTime = time;
}

export interface SystemStatusDeps {
  database?: typeof defaultDb;
  dbPath?: string;
  startTime?: number;
}

export async function systemStatus(deps: SystemStatusDeps = {}) {
  const database = deps.database ?? defaultDb;
  const dbPath = deps.dbPath ?? defaultConfig.DATABASE_URL;
  const start = deps.startTime ?? serverStartTime;

  try {
    const uptimeMs = Date.now() - start;
    const uptimeMinutes = Math.floor(uptimeMs / 60_000);

    const status: Record<string, unknown> = {
      uptimeMinutes,
    };

    try {
      status.dbSizeBytes = statSync(dbPath).size;
    } catch {
      // DB file may not be accessible — omit key per null-omission rule
    }

    // ISO 8601 via toISOString() — lexicographic comparison is safe for UTC
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();

    const recentErrorCount =
      database
        .select({ count: sql<number>`count(*)` })
        .from(systemLogs)
        .where(
          sql`${systemLogs.level} = 'error' AND ${systemLogs.timestamp} >= ${oneHourAgo}`
        )
        .get()?.count ?? 0;

    status.recentErrorCount = recentErrorCount;

    const lastLogEntry = database
      .select({
        timestamp: systemLogs.timestamp,
        level: systemLogs.level,
        source: systemLogs.source,
        message: systemLogs.message,
      })
      .from(systemLogs)
      .orderBy(desc(systemLogs.id))
      .limit(1)
      .get();

    if (lastLogEntry) {
      status.lastLogEntry = lastLogEntry;
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(status),
        },
      ],
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    log("error", "system_status", message, undefined, database);
    return {
      content: [
        {
          type: "text" as const,
          text: `Failed to retrieve system status: ${message}`,
        },
      ],
      isError: true,
    };
  }
}
