# Story 5.1: Scheduling Data & Constraints

Status: review

## Story

As a user,
I want my training plan to include scheduling context and my preferences,
So that Claude can match sessions against my calendar availability.

## Acceptance Criteria

1. **Given** an active plan with sessions exists
   **When** `get_current_plan` is called
   **Then** each session includes scheduling context: estimated duration, location type, and equipment needs derived from exercise metadata (FR3)

2. **Given** the `scheduling_preferences` table exists
   **When** drizzle-kit migration runs
   **Then** the table is created with single-row convention

3. **Given** scheduling preferences exist in the database
   **When** `get_current_plan` is called
   **Then** the response includes the user's scheduling constraints

4. **Given** calendar data is unavailable
   **When** scheduling is attempted
   **Then** the coach degrades gracefully (NFR8)

## Tasks / Subtasks

- [x] Task 1: Schema — scheduling_preferences table
  - [x] Define in schema.ts: earliest_time, latest_time, meeting_buffer_minutes, blackout_patterns_json, updated_at
  - [x] Generate migration 0011_magical_millenium_guard.sql

- [x] Task 2: Extend get_current_plan with scheduling context (AC: 1)
  - [x] Add estimatedDuration per session (warmup 10min + exercise min_duration + 5min transition each)
  - [x] Add locationTypes set per session from exercise metadata
  - [x] Add equipmentNeeded set per session (filtered "none")
  - [x] Include scheduling preferences when configured

- [x] Task 3: Tests — 3 new tests (15 total in get-current-plan.test.ts)
  - [x] Scheduling context per session (duration, location, equipment)
  - [x] Scheduling preferences included when configured
  - [x] Scheduling preferences omitted when not configured
  - [x] All 141 tests pass

## References

- [Source: architecture.md#FR Category to File Mapping] — get-current-plan.ts handles FR1, FR3
- [Source: epics.md#Story 5.1] — acceptance criteria
