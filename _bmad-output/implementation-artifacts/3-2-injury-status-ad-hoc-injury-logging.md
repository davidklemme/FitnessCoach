# Story 3.2: Injury Status & Ad-hoc Injury Logging

Status: review

## Story

As a user,
I want to record my injury status during sessions and log ad-hoc injuries between sessions,
So that the coach always has current injury data for safe training decisions.

## Acceptance Criteria

1. **Given** the `injury_status_log` table exists with columns: id, date, pain_level (0-10), location, trigger_exercise, severity, affected_areas_json, escalation_stage, notes, created_at
   **When** drizzle-kit migration runs
   **Then** the table is created with FK to exercises where applicable

2. **Given** a session is being logged
   **When** `log_session` is called with injury status data (pain_level, location, trigger_exercise)
   **Then** both session_logs and injury_status_log are written atomically in one transaction (FR7, NFR5)

3. **Given** an injury occurs outside a workout
   **When** `log_session` is called with injury-only data (no session exercises) and an ad-hoc flag
   **Then** an injury_status_log record is created with severity and affected body areas (FR8)
   **And** no session_logs record is created

4. **Given** pain_level is outside 0-10 range
   **When** the tool is called
   **Then** Zod validation rejects with a clear error message

## Tasks / Subtasks

- [x] Task 1: Schema — injury_status_log table (AC: 1)
  - [x] Define table in schema.ts with FK to exercises, date index, trigger_exercise_id index
  - [x] Generate migration via drizzle-kit (0007_overjoyed_cobalt_man.sql)

- [x] Task 2: Extend log_session to accept injury data (AC: 2)
  - [x] Add injurySchema with pain_level (0-10), location, trigger_exercise_id, severity, affected_areas, escalation_stage, notes
  - [x] Write injury_status_log atomically inside existing transaction

- [x] Task 3: Support ad-hoc injury-only logging (AC: 3)
  - [x] Add ad_hoc_injury boolean flag to schema
  - [x] Skip session_logs/session_log_entries creation when ad_hoc_injury=true
  - [x] Refine validation: ad_hoc_injury requires injury data

- [x] Task 4: Update server.ts tool description

- [x] Task 5: Update coach.md with injury logging modes

- [x] Task 6: Tests (AC: 1-4)
  - [x] Session + injury atomic logging
  - [x] Ad-hoc injury (no session record)
  - [x] Transaction rollback on FK violation (both session + injury)
  - [x] Invalid trigger_exercise_id FK
  - [x] Multiple injuries on same date
  - [x] Pain level 0-10 validation (rejects 11, -1)
  - [x] Ad-hoc injury without injury data rejected
  - [x] Pain level 0 accepted

## References

- [Source: architecture.md#FR Category to File Mapping] — log-session.ts handles FR6-9
- [Source: epics.md#Story 3.2] — acceptance criteria
