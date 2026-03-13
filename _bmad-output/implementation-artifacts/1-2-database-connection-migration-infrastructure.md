# Story 1.2: Database Connection & Migration Infrastructure

Status: review

## Story

As a developer,
I want a SQLite database with Drizzle ORM and automatic migrations,
so that all future tools have a reliable, versioned data layer to build on.

## Acceptance Criteria

1. **Given** the MCP server starts
   **When** `src/db/migrate.ts` runs on startup
   **Then** drizzle-kit migrations are applied in order and the SQLite DB file is created

2. **Given** the database connection is established
   **When** any query executes
   **Then** foreign key enforcement is enabled via `PRAGMA foreign_keys = ON` (NFR4)
   **And** WAL mode is enabled via `PRAGMA journal_mode = WAL`

3. **Given** a new migration is needed
   **When** a developer runs `npm run db:generate`
   **Then** drizzle-kit generates a SQL migration from schema diffs in `drizzle/migrations/`
   **And** no migration is ever hand-written (NFR6)

## Tasks / Subtasks

- [x] Task 1: Database connection module (AC: 2)
  - [x] Create `src/db/connection.ts` — better-sqlite3 instance using `config.DATABASE_URL`
  - [x] Enable `PRAGMA foreign_keys = ON` immediately after connection
  - [x] Enable `PRAGMA journal_mode = WAL` for Phase 2 concurrent access readiness
  - [x] Export typed Drizzle database instance (`drizzle(sqlite)`)
  - [x] Export raw better-sqlite3 instance for migration runner if needed

- [x] Task 2: Schema foundation (AC: 3)
  - [x] Create `src/db/schema.ts` — empty schema file with Drizzle imports ready
  - [x] Define a minimal `system_logs` table to validate the migration pipeline works end-to-end
    - Columns: `id` (integer PK), `timestamp` (text, ISO 8601), `level` (text), `source` (text), `message` (text), `metadata_json` (text, nullable)
  - [x] This table is architecturally required (Story 1.5 builds on it) and serves as a migration smoke test

- [x] Task 3: Migration infrastructure (AC: 1, 3)
  - [x] Create `src/db/migrate.ts` — runs Drizzle migrations on import/call
  - [x] Verify `drizzle.config.ts` (created in 1.1) points to correct schema and migrations paths
  - [x] Run `npm run db:generate` to produce the first migration from the system_logs schema
  - [x] Verify generated migration SQL in `drizzle/migrations/`

- [x] Task 4: Integrate with server startup (AC: 1)
  - [x] Import and run migrations in `src/index.ts` before MCP server connects
  - [x] Startup sequence: config validation → DB connection → migrations → MCP connect
  - [x] DB file is created automatically if it doesn't exist

- [x] Task 5: Tests (AC: 1, 2, 3)
  - [x] `src/db/connection.test.ts` — connection creates DB file, PRAGMAs are set correctly
  - [x] `src/db/migrate.test.ts` — migrations apply cleanly to a fresh in-memory or temp DB
  - [x] Use temp DB files for tests (clean up after), not the real DB
  - [x] All existing tests (from Story 1.1) still pass

## Dev Notes

### Architecture Compliance

All decisions below come from the architecture document. Follow exactly.

**Database (from architecture):**
- SQLite via `better-sqlite3` — synchronous API, no async DB calls
- Drizzle ORM wraps better-sqlite3 for type-safe queries
- `drizzle-kit generate` produces migrations from schema diffs — never hand-write migrations
- WAL mode from day one (Phase 2 webhook sidecar will be a second writer)
- Foreign key enforcement via PRAGMA (NFR4)

**Connection pattern:**
```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { config } from "../config.js";

const sqlite = new Database(config.DATABASE_URL);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite);
```

**Migration pattern:**
```typescript
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./connection.js";

migrate(db, { migrationsFolder: "./drizzle/migrations" });
```

**system_logs table schema (from architecture):**
- `(timestamp, level, source, message, metadata_json)`
- Levels: `debug`, `info`, `warn`, `error` — lowercase strings
- Source: tool name or component — `get_current_plan`, `migration`, `startup`
- Metadata: JSON string — `{"exerciseId": 42, "duration": 1.2}`

### Naming Conventions (from architecture)

- **DB tables:** `snake_case`, plural — `system_logs`
- **DB columns:** `snake_case` — `created_at`, `metadata_json`
- **Files:** `kebab-case.ts` — `connection.ts`, `schema.ts`, `migrate.ts`
- **Drizzle table variables:** camelCase matching table — `export const systemLogs = sqliteTable('system_logs', ...)`
- **Test files:** Co-located — `src/db/connection.test.ts`

### What This Story Does NOT Include

- No tool implementations (Epics 2-6)
- No exercise library data or seed migration (Story 1.3)
- No logger utility that writes to system_logs (Story 1.5)
- No system_status tool (Story 1.5)
- No TRAINER.md (Story 1.4)

This story produces a working database layer: connection with PRAGMAs, Drizzle ORM, migration infrastructure, and one table (system_logs) proving the pipeline works end-to-end.

### References

- [Source: architecture.md#Data Architecture] — Drizzle ORM, better-sqlite3, migration strategy
- [Source: architecture.md#Infrastructure & Deployment] — WAL mode, logging table schema
- [Source: architecture.md#Project Structure & Boundaries] — src/db/ file layout
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — naming, DB patterns
- [Source: epics.md#Story 1.2] — acceptance criteria, user story
- [Source: prd.md#NFR4] — foreign key enforcement
- [Source: prd.md#NFR6] — versioned, forward-compatible migrations

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- Task 1: `src/db/connection.ts` — better-sqlite3 instance from `config.DATABASE_URL`, WAL mode and foreign keys enabled via PRAGMA, exports Drizzle `db` instance with schema and raw `sqlite` handle.
- Task 2: `src/db/schema.ts` — `system_logs` table defined with Drizzle (id, timestamp, level, source, message, metadata_json). Serves as migration pipeline smoke test and is architecturally required for Story 1.5.
- Task 3: `src/db/migrate.ts` — exports `runMigrations()` using `drizzle-orm/better-sqlite3/migrator`. First migration generated by `drizzle-kit generate` → `drizzle/migrations/0000_nasty_wolverine.sql`.
- Task 4: `src/index.ts` updated — startup sequence is now: config validation → DB connection + PRAGMAs → migrations → MCP server connect.
- Task 5: 7 new tests (4 connection, 3 migration) + 5 existing = 12 total, all passing. Tests use temp DB files with cleanup. Connection tests verify file creation, WAL mode, FK enforcement, and Drizzle wrapping. Migration tests verify table creation, column schema, and idempotency.

### File List

- src/db/connection.ts (new)
- src/db/schema.ts (new)
- src/db/migrate.ts (new)
- src/db/connection.test.ts (new)
- src/db/migrate.test.ts (new)
- src/index.ts (modified)
- drizzle/migrations/0000_nasty_wolverine.sql (generated)
- drizzle/migrations/meta/0000_snapshot.json (generated)
- drizzle/migrations/meta/_journal.json (generated)
- _bmad-output/implementation-artifacts/1-2-database-connection-migration-infrastructure.md (new)
- _bmad-output/implementation-artifacts/1-1-project-scaffold-mcp-server-bootstrap.md (modified — status to done)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified)
