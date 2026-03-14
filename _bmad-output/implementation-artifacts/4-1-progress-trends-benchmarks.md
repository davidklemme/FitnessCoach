# Story 4.1: Progress Trends & Benchmarks

Status: review

## Story

As a user,
I want to view my progress trends per exercise and current benchmarks for all goal components,
So that I know where I stand and can make informed training decisions.

## Acceptance Criteria

1. **Given** the `benchmarks` table exists with columns: id, goal_component, target_value, current_value, unit, last_tested_date, created_at
   **When** drizzle-kit migration runs
   **Then** the table is created
   **And** initial benchmark records are seeded for configured goal components (pull-ups, push-ups, squats, running) with target values and null current values

2. **Given** `log_session` is called with a benchmark test flag for a goal component
   **When** the session is logged
   **Then** the corresponding benchmarks row is updated with current_value and last_tested_date in the same transaction

3. **Given** session logs exist with exercise data over multiple weeks
   **When** `get_progress` is called with an exercise name or ID
   **Then** it returns volume/performance trends over time for that exercise (FR25)
   **And** data points include date, sets, reps, RPE from session_log_entries

4. **Given** benchmarks have been recorded for goal components
   **When** `get_progress` is called with no specific exercise filter
   **Then** it returns current benchmarks for all goal components with target vs current values (FR26)
   **And** last tested date is included for each benchmark
   **And** the response completes within 3 seconds (NFR7)

## Tasks / Subtasks

- [x] Task 1: Schema — benchmarks table (AC: 1)
  - [x] Define table in schema.ts with unique goal_component
  - [x] Generate migration via drizzle-kit (0009_silly_wiccan.sql)

- [x] Task 2: Seed migration for initial benchmarks (AC: 1)
  - [x] Create 0010_seed_benchmarks.sql with pull_ups, push_ups, squats, running_5k
  - [x] Update journal.json

- [x] Task 3: Extend log_session for benchmark updates (AC: 2)
  - [x] Add benchmark_test schema (goal_component, value)
  - [x] Update benchmark row in same transaction
  - [x] Response includes benchmarkUpdated, benchmarkComponent, benchmarkValue

- [x] Task 4: Implement get_progress tool (AC: 3, 4)
  - [x] Exercise trends: query session_log_entries joined to session_logs, filtered by date range
  - [x] Exercise lookup by ID or name (partial match)
  - [x] Benchmarks always included in response
  - [x] Omit null fields per format patterns

- [x] Task 5: Register in server.ts (JSON string input pattern)

- [x] Task 6: Update coach.md with get_progress and benchmark_test docs

- [x] Task 7: Tests (AC: 1-4)
  - [x] `src/tools/get-progress.test.ts` — 12 tests
  - [x] All 127 tests pass

## References

- [Source: architecture.md#FR Category to File Mapping] — get-progress.ts handles FR25-29
- [Source: epics.md#Story 4.1] — acceptance criteria
