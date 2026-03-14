# Story 3.1: Log Completed Session

Status: review

## Story

As a user,
I want to log a completed workout with exercises, sets, reps, RPE, and notes,
So that the coach has accurate training history for programming decisions.

## Acceptance Criteria

1. **Given** the `session_logs` table exists with columns: id, date, session_type, session_order, rpe, prehab_completed, notes, created_at
   **And** the `session_log_entries` table exists with columns: id, session_log_id (FK), exercise_id (FK to exercises), sets, reps, weight, rpe_per_exercise, notes
   **When** drizzle-kit migration runs
   **Then** both tables are created with foreign key enforcement
   **And** a unique composite key exists on session_logs (date, session_type, session_order)

2. **Given** a session is completed
   **When** `log_session` is called with exercises performed, sets, reps, RPE, and notes
   **Then** a session log record and its exercise entries are created (FR6)
   **And** the write completes within a transaction (NFR5)

3. **Given** `log_session` is called twice with the same date, session_type, and session_order
   **When** both calls execute
   **Then** the second call upserts — no duplicate record is created (NFR3)

4. **Given** the user does two sessions of the same type in one day
   **When** `log_session` is called for each
   **Then** session_order distinguishes them (1, 2, ...) and both are stored without collision

5. **Given** `log_session` is called with invalid input (missing required fields)
   **When** Zod validation runs
   **Then** a descriptive error is returned via SDK `isError: true` before any DB write

## Tasks / Subtasks

- [x] Task 1: Schema — session_logs and session_log_entries tables (AC: 1)
  - [x] Define tables in schema.ts with FKs, composite unique index, and FK indexes
  - [x] Generate migration via drizzle-kit (0006_bent_champions.sql)

- [x] Task 2: Implement log_session tool (AC: 2, 3, 4)
  - [x] Zod input schema with validation
  - [x] Transaction: insert session_log + entries
  - [x] Upsert on (date, session_type, session_order) — deletes old entries, re-inserts
  - [x] Exercise ID FK validation via DB constraint

- [x] Task 3: Register tool in server.ts (JSON string input pattern)

- [x] Task 4: Update coach.md with log_session tool

- [x] Task 5: Tests (AC: 1-5)
  - [x] `src/tools/log-session.test.ts` — 13 tests (7 integration + 1 normalization + 5 schema validation)
  - [x] All 96 tests pass

## References

- [Source: architecture.md#Naming Patterns] — table/column conventions
- [Source: epics.md#Story 3.1] — acceptance criteria
