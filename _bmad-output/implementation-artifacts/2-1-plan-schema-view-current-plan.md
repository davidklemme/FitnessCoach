# Story 2.1: Plan Schema & View Current Plan

Status: review

## Story

As a user,
I want to view my current training plan with mesocycle phase, week number, and all scheduled sessions,
So that the coach and I share the same picture of where I am in my program.

## Acceptance Criteria

1. **Given** the `plans` table exists with columns: id, mesocycle_name, phase, week_number, status, start_date, end_date, created_at
   **And** the `plan_sessions` table exists with columns: id, plan_id (FK), session_type, day_of_week
   **And** the `plan_session_exercises` junction table exists with columns: id, plan_session_id (FK), exercise_id (FK to exercises), sets, reps, notes
   **When** drizzle-kit migration runs
   **Then** all tables are created with foreign key enforcement — exercise references are FKs, not JSON blobs (NFR4)

2. **Given** an active plan exists in the database
   **When** the `get_current_plan` tool is called
   **Then** it returns the active plan with mesocycle phase, week number, and all scheduled sessions (FR1)
   **And** the response includes session details with exercise names and volume targets
   **And** the response completes within 3 seconds (NFR7)

3. **Given** no active plan exists
   **When** the `get_current_plan` tool is called
   **Then** it returns an actionable message: "No active plan found. Use update_plan with action: 'create' to create one." via SDK `isError: true`

## Tasks / Subtasks

- [x] Task 1: Schema definition (AC: 1)
  - [x] Add `plans`, `planSessions`, `planSessionExercises` tables to `src/db/schema.ts`
  - [x] Foreign keys: plan_sessions.plan_id → plans.id, plan_session_exercises.plan_session_id → plan_sessions.id, plan_session_exercises.exercise_id → exercises.id
  - [x] Run `drizzle-kit generate` → `0003_lucky_mantis.sql`

- [x] Task 2: get_current_plan tool (AC: 2, 3)
  - [x] Create `src/tools/get-current-plan.ts`
  - [x] Query active plan (status = 'active') with sessions and exercises joined
  - [x] Include exercise names from exercises table
  - [x] Return actionable error when no active plan exists
  - [x] Log errors before returning isError
  - [x] Register tool in `src/server.ts`

- [x] Task 3: Tests (AC: 1, 2, 3)
  - [x] `src/tools/get-current-plan.test.ts` — 9 tests
  - [x] All 52 tests pass

## References

- [Source: architecture.md#Data Architecture] — Drizzle ORM, schema-as-code
- [Source: architecture.md#Process Patterns] — validation sequence, error handling
- [Source: epics.md#Story 2.1] — acceptance criteria
