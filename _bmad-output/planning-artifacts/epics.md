---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - prd.md
  - architecture.md
workflowType: 'epics-and-stories'
status: 'complete'
completedAt: '2026-02-12'
---

# FitnessCoach - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for FitnessCoach, decomposing the requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: The user can view the current training plan including mesocycle phase, week number, and all scheduled sessions
FR2: The user can modify the training plan by swapping exercises, adjusting volume, or triggering a deload
FR3: The coach can propose a 2-week workout schedule based on current plan phase and available calendar slots
FR4: The user can approve, modify, or reject a proposed schedule before events are created
FR5: The coach can adjust the plan in response to injury or status changes, substituting exercises based on impact assessment
FR6: The user can log a completed session with exercises performed, sets, reps, RPE, and free-text notes
FR7: The user can record injury status (pain 0-10, location, trigger exercise) at every check-in
FR8: The user can log ad-hoc injuries or status changes with severity and affected body areas
FR9: The system can compare planned vs actual session data when Watch workout data is available (Phase 2)
FR10: The coach can read the user's Google Calendar to identify free windows within scheduling constraints (configurable time bounds, meeting buffers, blackout periods)
FR11: The coach can create workout events on the user's Google Calendar with session details (type, duration, exercises)
FR12: The coach can modify or cancel existing workout events when plan changes are approved
FR13: The coach can read unified availability across multiple calendar providers via Cal.com API (Phase 2)
FR14: The user can browse and search the exercise library filtered by location type, equipment required, duration, and joint stress rating
FR15: The system maintains progression ladders for each exercise (e.g., banded pull-ups → negatives → clean → volume)
FR16: Each exercise has metadata: minimum duration, location type (home/outdoor/gym/pool/anywhere), equipment required, joint stress rating, muscle groups targeted
FR17: The coach asks about injury status at the start of every check-in
FR18: The system enforces non-negotiable prehab exercises before every push/pull session
FR19: The system escalates through injury protocol stages: monitor → reduce volume → swap to low-impact alternatives → forced rest when pain thresholds are exceeded
FR20: The system tracks weekly push/pull volume caps and enforces tendon-safe progression rates
FR21: The user can report health observations manually during check-in (sleep quality, energy, soreness)
FR22: The system can ingest Apple Watch health data via webhook (sleep, HRV, resting HR, VO2max, workout summaries) (Phase 2)
FR23: The coach can flag concerning health trends (declining HRV, poor sleep patterns) and recommend intensity adjustments (Phase 2)
FR24: The system can compute a composite recovery score from available health data (Phase 2)
FR25: The user can view progress trends for any tracked exercise over time
FR26: The user can view current benchmarks for all goal components (e.g., pull-ups, push-ups, squats, running for Murph)
FR27: The system can project goal readiness based on current progression rates and remaining time (Phase 2)
FR28: The system identifies bottleneck exercises that are behind target for goal completion
FR29: The coach enforces the 10% weekly volume rule for running progression
FR30: The system loads TRAINER.md as context to establish the coaching persona
FR31: The coach can conduct a structured check-in flow: injury status → health/status review → last session review → upcoming plan preview
FR32: The coach calls out skipped sessions and inconsistency based on plan vs actual data
FR33: The coach respects recovery as training — recommends rest days based on training load and health signals
FR34: The coach recognizes injury severity thresholds and responds with "see a doctor" when appropriate

### NonFunctional Requirements

NFR1: MCP tool calls must return structured JSON with clear error messages on failure. Claude needs actionable error context to communicate failures.
NFR2: Health webhook sidecar must validate incoming JSON against the Health Auto Export schema and reject malformed payloads with logged errors, not silent drops (Phase 2).
NFR3: All write operations (session logging, plan updates, calendar events) must be idempotent — retried tool calls must not create duplicate records or side effects.
NFR4: SQLite must use foreign key enforcement to prevent orphaned records.
NFR5: All writes must be transactional — partial session logs must not occur.
NFR6: All schema changes applied via versioned, forward-compatible migrations that preserve existing data.
NFR7: All MCP tool calls should complete within 3 seconds, including composite tools like check_in.
NFR8: MCP tools must function with partial data availability. Missing calendar data, health data, or Cal.com access must not block coaching — the coach degrades to conversational input for unavailable data sources.
NFR9: MCP server must start and connect to Claude within 5 seconds of launch.
NFR10: Webhook sidecar must run as a persistent process without manual restart (launchd, pm2, or equivalent) (Phase 2).
NFR11: Environment configuration (DB path, webhook port, API keys) externalized in .env. No hardcoded values.
NFR12: MCP server and webhook sidecar must log errors and key operations to a queryable log. system_status tool reports operational health: last webhook received, DB size, last session logged, uptime.
NFR13: TRAINER.md must be structured with clearly separated concerns (persona, injury protocol, scheduling rules, periodization framework, recovery rules) so sections can be updated independently.

### Additional Requirements

**From Architecture — Starter/Scaffold:**
- Custom scaffold from SDK examples (no starter template). Impacts Epic 1 Story 1: npm init + manual dependency installation.

**From Architecture — Infrastructure:**
- Node.js v22 LTS required (better-sqlite3 incompatible with v24). Enforce via .nvmrc.
- tsup bundler for single output file (dist/index.js). MCP config points here.
- vitest for testing. Co-located test files (*.test.ts alongside source).
- dotenv + zod for environment validation at startup. Fail fast with clear messages.

**From Architecture — Data Layer:**
- Drizzle ORM + better-sqlite3 as SQLite driver. All schema in src/db/schema.ts.
- drizzle-kit generates migrations from schema diffs. Never hand-write migrations.
- Exercise library seeded via SQL INSERT migration file (0001_seed_exercises.sql).
- Composite natural keys for idempotency (e.g., log_session deduplicates on date + session_type).
- src/db/queries.ts shared query layer for cross-tool query reuse.

**From Architecture — MCP Patterns:**
- One file per tool in src/tools/. Each exports a single handler function.
- Tool registration centralized in src/server.ts.
- Zod → business validation → execute → respond sequence for every tool.
- SDK-native error handling (isError: true). No custom error envelope.
- Success responses: domain object at top level + optional _meta: { asOf, source }.
- system_logs SQLite table for structured logging. system_status tool reads it.

**From Architecture — Resource:**
- TRAINER.md loaded as MCP Resource (trainer://persona). File path from env config.
- TRAINER.md is the highest-leverage artifact — drives Claude's coaching reasoning.

**From Architecture — Phase 2 Prep:**
- WAL mode setup in connection.ts for future concurrent access (webhook sidecar).
- Project structure pre-defines Phase 2 locations (webhook-sidecar/, src/prompts/).

### FR Coverage Map

FR1: Epic 2 — View current training plan
FR2: Epic 2 — Modify training plan (swap exercises, adjust volume, trigger deload)
FR3: Epic 5 — Propose 2-week schedule based on plan phase + calendar
FR4: Epic 5 — Approve, modify, or reject proposed schedule
FR5: Epic 2 — Adjust plan in response to injury or status changes
FR6: Epic 3 — Log completed session (exercises, sets, reps, RPE, notes)
FR7: Epic 3 — Record injury status (pain 0-10, location, trigger)
FR8: Epic 3 — Log ad-hoc injuries or status changes
FR9: Phase 2 — Compare planned vs actual from Watch data
FR10: Epic 5 — Read Google Calendar for free windows
FR11: Epic 5 — Create workout events on Google Calendar
FR12: Epic 5 — Modify or cancel workout events
FR13: Phase 2 — Unified availability via Cal.com
FR14: Epic 1 — Browse and search exercise library with filters
FR15: Epic 1 — Progression ladders per exercise
FR16: Epic 1 — Exercise metadata (duration, location, equipment, joint stress, muscles)
FR17: Epic 3 — Injury status check at every check-in
FR18: Epic 3 — Non-negotiable prehab enforcement
FR19: Epic 3 — Injury protocol escalation stages
FR20: Epic 3 — Weekly push/pull volume caps
FR21: Epic 3 — Manual health observations during check-in
FR22: Phase 2 — Apple Watch health data via webhook
FR23: Phase 2 — Flag concerning health trends
FR24: Phase 2 — Composite recovery score
FR25: Epic 4 — Progress trends per exercise
FR26: Epic 4 — Current benchmarks for all goal components
FR27: Phase 2 — Goal readiness projection
FR28: Epic 4 — Bottleneck exercise identification
FR29: Epic 4 — 10% weekly running volume rule
FR30: Epic 1 — Load TRAINER.md as coaching persona
FR31: Epic 6 — Structured check-in flow (injury → health → session → plan)
FR32: Epic 6 — Call out skipped sessions and inconsistency
FR33: Epic 6 — Recovery-as-training recommendations
FR34: Epic 6 — Injury severity thresholds ("see a doctor")

**Coverage:** 26/26 MVP FRs mapped. 6 Phase 2 FRs tracked (FR9, FR13, FR22-24, FR27).

## Epic List

### Epic 1: Project Foundation & Exercise Library
The MCP server is running, the exercise library is browsable, and Claude has the coaching persona loaded.
**FRs covered:** FR14, FR15, FR16, FR30
**NFRs addressed:** NFR1, NFR4, NFR6, NFR7, NFR9, NFR11, NFR12, NFR13

### Epic 2: Training Plan Management
The user can create, view, and modify training plans. The coach can adjust plans for injuries or status changes.
**FRs covered:** FR1, FR2, FR5
**NFRs addressed:** NFR3

### Epic 3: Session Logging & Injury Tracking
The user can log workouts, track injury status, and the coach enforces safety protocols (prehab, volume caps, escalation).
**FRs covered:** FR6, FR7, FR8, FR17, FR18, FR19, FR20, FR21
**NFRs addressed:** NFR3, NFR5

### Epic 4: Progress & Goal Tracking
The user can see progress trends, current benchmarks, and the coach identifies bottleneck exercises.
**FRs covered:** FR25, FR26, FR28, FR29

### Epic 5: Calendar-Aware Scheduling
The coach reads the calendar, proposes workouts in open slots, and creates events the user approves.
**FRs covered:** FR3, FR4, FR10, FR11, FR12
**NFRs addressed:** NFR8

### Epic 6: Structured Check-in Flow
The coach conducts intelligent check-ins that tie everything together: injury → health → session review → plan preview.
**FRs covered:** FR31, FR32, FR33, FR34
**NFRs addressed:** NFR7, NFR8

## Epic 1: Project Foundation & Exercise Library

The MCP server is running, the exercise library is browsable, and Claude has the coaching persona loaded.

### Story 1.1: Project Scaffold & MCP Server Bootstrap

As a developer,
I want a fully configured MCP server project that connects to Claude via stdio,
So that I have a working foundation to build all fitness coaching tools on.

**Acceptance Criteria:**

**Given** a fresh clone of the repository
**When** I run `npm install && npm run build`
**Then** `dist/index.js` is produced by tsup as a single bundled file
**And** `.nvmrc` specifies Node v22 LTS

**Given** `.env` is configured with required values
**When** the MCP server starts
**Then** `src/config.ts` validates environment variables via zod and fails fast with clear messages if any are missing
**And** the server connects to Claude via stdio transport within 5 seconds (NFR9)

**Given** the MCP server is registered in Claude's MCP config pointing to `dist/index.js`
**When** Claude starts a session
**Then** the server connects successfully with zero tools registered
**And** `npm run test` executes vitest with no failures

### Story 1.2: Database Connection & Migration Infrastructure

As a developer,
I want a SQLite database with Drizzle ORM and automatic migrations,
So that all future tools have a reliable, versioned data layer to build on.

**Acceptance Criteria:**

**Given** the MCP server starts
**When** `src/db/migrate.ts` runs on startup
**Then** drizzle-kit migrations are applied in order and the SQLite DB file is created

**Given** the database connection is established
**When** any query executes
**Then** foreign key enforcement is enabled via `PRAGMA foreign_keys = ON` (NFR4)
**And** WAL mode is enabled via `PRAGMA journal_mode = WAL`

**Given** a new migration is needed
**When** a developer runs `npm run db:generate`
**Then** drizzle-kit generates a SQL migration from schema diffs in `drizzle/migrations/`
**And** no migration is ever hand-written (NFR6)

### Story 1.3: Exercise Library with Browse & Search

As a user,
I want to browse and search exercises filtered by location, equipment, duration, and joint stress,
So that the coach can match exercises to my situation and constraints.

**Acceptance Criteria:**

**Given** the `exercises` table exists with columns: name, location_type, equipment_required, min_duration, joint_stress_rating, muscle_groups, progression_ladder
**When** the seed migration `0001_seed_exercises.sql` runs
**Then** the exercise library is populated with bodyweight-focused exercises including progression ladders (FR15)

**Given** the `get_exercise_library` tool is called with no filters
**When** Claude invokes it
**Then** all exercises are returned with full metadata (FR16)

**Given** the `get_exercise_library` tool is called with filter parameters (location_type, equipment, max_joint_stress, muscle_group)
**When** Claude invokes it
**Then** only matching exercises are returned (FR14)
**And** each exercise includes its progression ladder (FR15)
**And** the response completes within 3 seconds (NFR7)

### Story 1.4: Coaching Persona Resource

As a user,
I want Claude to have my coaching persona loaded automatically,
So that every interaction reflects the training philosophy, injury protocols, and scheduling rules.

**Acceptance Criteria:**

**Given** `TRAINER.md` exists at the path specified in `.env`
**When** the MCP server starts
**Then** `src/resources/trainer-persona.ts` loads the file and registers it as resource `trainer://persona`

**Given** Claude reads the `trainer://persona` resource
**When** the content is returned
**Then** it contains clearly separated sections: persona, injury protocol, scheduling rules, periodization framework, recovery rules (NFR13)
**And** each section can be updated independently without affecting others

**Given** `TRAINER.md` is missing or unreadable
**When** the MCP server starts
**Then** the server logs a warning but does not crash (NFR8)

### Story 1.5: Structured Logging & System Status

As a user,
I want to check the operational health of the MCP server,
So that I can verify data integrity and diagnose issues.

**Acceptance Criteria:**

**Given** the `system_logs` table exists with columns: timestamp, level, source, message, metadata_json
**When** any tool encounters an error
**Then** `src/lib/logger.ts` writes a structured log entry before returning the error response (NFR1)

**Given** the `system_status` tool is called
**When** Claude invokes it
**Then** it returns: DB file size, last session logged timestamp, server uptime, recent error count (NFR12)
**And** the response is structured JSON with actionable context

**Given** log entries exist at various levels (debug, info, warn, error)
**When** `system_status` queries logs
**Then** it can filter and summarize by level and time range

## Epic 2: Training Plan Management

The user can create, view, and modify training plans. The coach can adjust plans for injuries or status changes.

### Story 2.1: Plan Schema & View Current Plan

As a user,
I want to view my current training plan with mesocycle phase, week number, and all scheduled sessions,
So that the coach and I share the same picture of where I am in my program.

**Acceptance Criteria:**

**Given** the `plans` table exists with columns: id, mesocycle_name, phase, week_number, status, start_date, end_date, created_at
**And** the `plan_sessions` table exists with columns: id, plan_id (FK), session_type, day_of_week
**And** the `plan_session_exercises` junction table exists with columns: id, plan_session_id (FK), exercise_id (FK to exercises), sets, reps, notes
**When** drizzle-kit migration runs
**Then** all tables are created with foreign key enforcement — exercise references are FKs, not JSON blobs (NFR4)

**Given** an active plan exists in the database
**When** the `get_current_plan` tool is called
**Then** it returns the active plan with mesocycle phase, week number, and all scheduled sessions (FR1)
**And** the response includes session details with exercise names and volume targets
**And** the response completes within 3 seconds (NFR7)

**Given** no active plan exists
**When** the `get_current_plan` tool is called
**Then** it returns an actionable message: "No active plan found. Use update_plan with action: 'create' to create one." via SDK `isError: true`

### Story 2.2: Update Training Plan

As a user,
I want to create and modify my training plan by swapping exercises, adjusting volume, or triggering a deload,
So that the plan evolves with my progress and recovery needs.

**Acceptance Criteria:**

**Given** no active plan exists
**When** `update_plan` is called with `action: 'create'` and mesocycle details (name, phase, week_number, sessions with exercises)
**Then** a new plan is created with all sessions and exercise assignments
**And** exercises are validated against the exercise library via FK

**Given** `update_plan` accepts a discriminated union on `action` field
**When** the Zod input schema is defined
**Then** it supports distinct action types: `create`, `swap_exercise`, `adjust_volume`, `deload`, `injury_adjust`, `schedule_confirm`, `schedule_cancel`, `schedule_reject`
**And** each action type has its own required/optional fields validated independently

**Given** an active plan exists
**When** `update_plan` is called with `action: 'swap_exercise'` (session_id, old_exercise_id, new_exercise_id)
**Then** the plan_session_exercises record is updated with the new exercise
**And** the new exercise exists in the exercise library (FK validated)

**Given** an active plan exists
**When** `update_plan` is called with `action: 'adjust_volume'` (session_exercise_id, new sets/reps)
**Then** the plan_session_exercises volume targets are updated

**Given** an active plan exists
**When** `update_plan` is called with `action: 'deload'`
**Then** volume across all remaining sessions in the current week is reduced per deload rules
**And** the plan status reflects the deload

**Given** `update_plan` is called twice with identical parameters
**When** both calls execute
**Then** the result is the same as a single call — no duplicate side effects (NFR3)

### Story 2.3: Injury-Responsive Plan Adjustment

As a user,
I want the coach to adjust my plan when I report an injury, substituting exercises based on what's affected,
So that I keep training safely without manually rebuilding the plan.

**Acceptance Criteria:**

**Given** an active plan exists and an injury is reported with affected body areas and pain level
**When** `update_plan` is called with `action: 'injury_adjust'` (affected_areas, pain_level)
**Then** exercises in upcoming sessions that stress affected areas are identified
**And** for each substitution, the original exercise_id is stored in a `replaced_by` field on plan_session_exercises (preserving pre-injury state)
**And** alternative exercises with low joint stress on affected areas are queried from the exercise library
**And** substitutions are applied to upcoming plan sessions (FR5)

**Given** no suitable alternative exercises exist for a session
**When** substitution is attempted
**Then** the session is flagged for review rather than silently dropping exercises
**And** the response communicates which sessions need manual adjustment

**Given** the injury clears (pain returns to 0)
**When** `update_plan` is called to restore original exercises
**Then** plan_session_exercises with non-null `replaced_by` are reverted to their original exercise_id

## Epic 3: Session Logging & Injury Tracking

The user can log workouts, track injury status, and the coach enforces safety protocols (prehab, volume caps, escalation).

### Story 3.1: Log Completed Session

As a user,
I want to log a completed workout with exercises, sets, reps, RPE, and notes,
So that the coach has accurate training history for programming decisions.

**Acceptance Criteria:**

**Given** the `session_logs` table exists with columns: id, date, session_type, session_order, rpe, prehab_completed, notes, created_at
**And** the `session_log_entries` table exists with columns: id, session_log_id (FK), exercise_id (FK to exercises), sets, reps, weight, rpe_per_exercise, notes
**When** drizzle-kit migration runs
**Then** both tables are created with foreign key enforcement — exercise references are FKs, not JSON blobs (NFR4)
**And** a unique composite key exists on session_logs (date, session_type, session_order)

**Given** a session is completed
**When** `log_session` is called with exercises performed, sets, reps, RPE, and free-text notes
**Then** a session log record and its exercise entries are created (FR6)
**And** the write completes within a transaction (NFR5)
**And** if the session includes benchmark exercises matching a goal component, the `benchmarks` table current_value and last_tested_date are updated in the same transaction

**Given** `log_session` is called twice with the same date, session_type, and session_order
**When** both calls execute
**Then** the second call upserts — no duplicate record is created (NFR3)

**Given** the user does two sessions of the same type in one day (e.g., morning pull-ups, evening push-ups)
**When** `log_session` is called for each
**Then** session_order distinguishes them (1, 2, ...) and both are stored without collision

**Given** `log_session` is called with invalid input (missing required fields)
**When** Zod validation runs
**Then** a descriptive error is returned via SDK `isError: true` before any DB write

### Story 3.2: Injury Status & Ad-hoc Injury Logging

As a user,
I want to record my injury status during sessions and log ad-hoc injuries between sessions,
So that the coach always has current injury data for safe training decisions.

**Acceptance Criteria:**

**Given** the `injury_status_log` table exists with columns: id, date, pain_level (0-10), location, trigger_exercise, severity, affected_areas_json, escalation_stage, notes, created_at
**When** drizzle-kit migration runs
**Then** the table is created with FK to exercises where applicable

**Given** a session is being logged
**When** `log_session` is called with injury status data (pain_level, location, trigger_exercise)
**Then** both session_logs and injury_status_log are written atomically in one transaction (FR7, NFR5)

**Given** an injury occurs outside a workout
**When** `log_session` is called with injury-only data (no session exercises) and an ad-hoc flag
**Then** an injury_status_log record is created with severity and affected body areas (FR8)
**And** no session_logs record is created

**Given** pain_level is outside 0-10 range
**When** the tool is called
**Then** Zod validation rejects with a clear error message

### Story 3.3: Injury Protocol Data & Health Observations

As a user,
I want the coach to track my prehab compliance, weekly volume, and injury escalation,
So that safety protocols are enforced based on real data, not guesswork.

**Acceptance Criteria:**

**Given** the `health_observations` table exists with columns: id, date, sleep_quality (1-5), energy_level (1-5), soreness_level (1-5), notes, created_at
**When** drizzle-kit migration runs
**Then** the table is created

**Given** session logs exist for the current week
**When** weekly push/pull volume is queried via session_log_entries joined to exercises (by muscle group)
**Then** total sets and reps for push and pull exercises are returned, enabling Claude (guided by TRAINER.md) to enforce volume caps (FR20)

**Given** a push or pull session is logged
**When** the session data is recorded
**Then** prehab_completed boolean is stored on session_logs (FR18)
**And** tools return this data so Claude (guided by TRAINER.md) can enforce prehab-first protocols (FR17)

**Given** an injury is logged with escalating pain levels across multiple entries
**When** injury_status_log is queried
**Then** the current escalation stage is retrievable: monitor → reduce volume → swap to low-impact → forced rest (FR19)
**And** tools return this data so Claude (guided by TRAINER.md) can enforce the appropriate protocol stage

**Given** a check-in occurs and the user reports health observations (sleep quality, energy level, soreness)
**When** `log_session` is called with health observation data (or health-only flag for non-session days)
**Then** a health_observations record is created for that date (FR21)
**And** subsequent tools (check_in, get_progress) can query this data for recovery-aware decisions

## Epic 4: Progress & Goal Tracking

The user can see progress trends, current benchmarks, and the coach identifies bottleneck exercises.

### Story 4.1: Progress Trends & Benchmarks

As a user,
I want to view my progress trends per exercise and current benchmarks for all goal components,
So that I know where I stand and can make informed training decisions.

**Acceptance Criteria:**

**Given** the `benchmarks` table exists with columns: id, goal_component, target_value, current_value, unit, last_tested_date, created_at
**When** drizzle-kit migration runs
**Then** the table is created
**And** initial benchmark records are seeded for configured goal components (pull-ups, push-ups, squats, running) with target values and null current values

**Given** `log_session` is called with a benchmark test flag for a goal component
**When** the session is logged
**Then** the corresponding benchmarks row is updated with current_value and last_tested_date in the same transaction (write path for benchmarks)

**Given** session logs exist with exercise data over multiple weeks
**When** `get_progress` is called with an exercise name or ID
**Then** it returns volume/performance trends over time for that exercise (FR25)
**And** data points include date, sets, reps, RPE from session_log_entries

**Given** benchmarks have been recorded for goal components
**When** `get_progress` is called with no specific exercise filter
**Then** it returns current benchmarks for all goal components with target vs current values (FR26)
**And** last tested date is included for each benchmark
**And** the response completes within 3 seconds (NFR7)

### Story 4.2: Bottleneck Identification & Running Volume Rule

As a user,
I want the coach to identify which exercises are behind target and enforce safe running progression,
So that training focus is directed where it matters most and injury risk is managed.

**Acceptance Criteria:**

**Given** benchmarks exist with target and current values for multiple goal components
**When** `get_progress` is called
**Then** components where current_value is behind expected progression rate are flagged as bottlenecks (FR28)
**And** bottlenecks are ranked by gap severity (largest gap first)

**Given** session logs contain running sessions over the past 2+ weeks
**When** `get_progress` is called for running data
**Then** weekly running volume (total distance) is calculated from session_logs
**And** the week-over-week increase percentage is returned
**And** any week exceeding 10% increase over the previous week is flagged (FR29)

**Given** no session logs or benchmarks exist yet
**When** `get_progress` is called
**Then** the response indicates no data available with an actionable message, not an error

## Epic 5: Calendar-Aware Scheduling

The coach reads the calendar, proposes workouts in open slots, and creates events the user approves. Fitness Coach MCP provides scheduling data and tracks state; Claude orchestrates calendar reads/writes through Google Workspace MCP.

### Story 5.1: Scheduling Data & Constraints

As a user,
I want the coach to know my scheduling constraints and match workouts to realistic time slots,
So that proposed schedules respect my availability and session requirements.

**Acceptance Criteria:**

**Given** an active plan with sessions exists
**When** `get_current_plan` is called
**Then** each session includes scheduling context: estimated duration, location type, and equipment needs derived from exercise metadata (FR3)
**And** Claude has sufficient data to match sessions against calendar availability

**Given** the `scheduling_preferences` table exists with columns: id, earliest_time, latest_time, meeting_buffer_minutes, blackout_patterns_json, updated_at
**When** drizzle-kit migration runs
**Then** the table is created with a single-row convention (user preferences, not per-session)

**Given** scheduling preferences exist in the database
**When** `get_current_plan` is called
**Then** the response includes the user's scheduling constraints from the DB (FR10)
**And** Claude can apply these constraints when scanning Google Calendar via Google Workspace MCP
**And** preferences can be updated at runtime without server restart

**Given** calendar data is unavailable (Google Workspace MCP unreachable)
**When** scheduling is attempted
**Then** the coach degrades gracefully — accepts manual time input from the user instead of blocking (NFR8)

### Story 5.2: Schedule Confirmation & Event Management

As a user,
I want to approve, modify, or reject proposed workout times and have the plan track what's scheduled,
So that my plan reflects reality and calendar events stay in sync.

**Acceptance Criteria:**

**Given** `plan_sessions` has additional columns: scheduled_status, calendar_event_id, scheduled_datetime
**When** drizzle-kit migration runs
**Then** existing plan_sessions are preserved with null scheduling fields

**Given** a schedule is proposed and the user approves
**When** `update_plan` is called with schedule confirmation (session ID, datetime, calendar_event_id)
**Then** the plan session is marked as scheduled with the event reference (FR4, FR11)
**And** multiple sessions can be confirmed in a single call

**Given** the user wants to modify a scheduled session time
**When** `update_plan` is called with a reschedule (session ID, new datetime, new calendar_event_id)
**Then** the old event reference is cleared and the new one is stored (FR12)

**Given** the user wants to cancel a scheduled session
**When** `update_plan` is called with a cancellation (session ID)
**Then** the session's scheduled_status is cleared and calendar_event_id is removed (FR12)
**And** the session remains in the plan as unscheduled

**Given** the user rejects the entire proposed schedule
**When** `update_plan` is called with `action: 'schedule_reject'`
**Then** no scheduling state changes occur and the plan remains as-is (FR4)

**Given** Claude creates a calendar event via Google Workspace MCP but the subsequent `update_plan` call to store the event ID fails
**When** the partial failure is detected
**Then** the response includes the orphaned calendar_event_id so Claude can retry the `update_plan` call or clean up the calendar event

## Epic 6: Structured Check-in Flow

The coach conducts intelligent check-ins that tie everything together: injury → health → session review → plan preview.

### Story 6.1: Check-in Composite Tool

As a user,
I want a single check-in tool that assembles my full coaching context,
So that the coach has everything needed for an informed conversation without multiple tool calls.

**Acceptance Criteria:**

**Given** the `check_in` tool is called
**When** it executes
**Then** it returns a structured response with sections: current injury status, recent health observations, last session summary, and upcoming plan preview (FR31)
**And** shared queries in `src/db/queries.ts` are used for cross-table reads without importing other tool modules

**Given** the database has data across all tables (plans, sessions, injuries, exercises, benchmarks)
**When** `check_in` is called
**Then** the response completes within 3 seconds (NFR7)

**Given** some data sources are empty (no session logs yet, no injury history, no health observations)
**When** `check_in` is called
**Then** present sections are returned with data and missing sections are omitted gracefully (NFR8)
**And** the response never fails due to missing optional data

**Given** the `check_in` tool is called
**When** injury data exists
**Then** injury status appears first in the response, enabling TRAINER.md's injury-first check-in pattern (FR17 data support)

### Story 6.2: Coaching Intelligence Data

As a user,
I want the coach to flag skipped sessions, recommend recovery, and escalate serious injuries,
So that the coaching is proactive about consistency, recovery, and safety.

**Acceptance Criteria:**

**Given** planned sessions exist for the past week and some were not logged
**When** `check_in` is called
**Then** the response includes a skipped_sessions array listing planned-but-unlogged sessions with dates and session types (FR32)

**Given** session logs from the past 7 days show high training load (multiple high-RPE sessions, consecutive training days)
**When** `check_in` is called
**Then** the response includes a training_load summary with total sessions, average RPE, rest days taken (FR33)
**And** TRAINER.md can use this data to recommend rest days

**Given** the most recent injury_status_log entry has a pain_level at or above the defined severity threshold
**When** `check_in` is called
**Then** the response includes a severity_alert flag with the pain level and location (FR34)
**And** TRAINER.md can respond with "see a doctor" guidance

**Given** no skipped sessions, normal training load, and no injury alerts exist
**When** `check_in` is called
**Then** the coaching intelligence fields are absent from the response (no false alarms)
