import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./connection.js";

export function runMigrations() {
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
}
