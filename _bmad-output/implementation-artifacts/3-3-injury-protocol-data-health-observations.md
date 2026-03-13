# Story 3.3: Injury Protocol Data & Health Observations

Status: review

## Story

As a user,
I want the coach to track my prehab compliance, weekly volume, and injury escalation,
So that safety protocols are enforced based on real data, not guesswork.

## Acceptance Criteria

1. **Given** the `health_observations` table exists with columns: id, date, sleep_quality (1-5), energy_level (1-5), soreness_level (1-5), notes, created_at
   **When** drizzle-kit migration runs
   **Then** the table is created

2. **Given** session logs exist for the current week
   **When** weekly push/pull volume is queried via session_log_entries joined to exercises (by muscle group)
   **Then** total sets and reps for push and pull exercises are returned, enabling Claude to enforce volume caps (FR20)

3. **Given** a push or pull session is logged
   **When** the session data is recorded
   **Then** prehab_completed boolean is stored on session_logs (FR18)
   **And** tools return this data so Claude can enforce prehab-first protocols (FR17)

4. **Given** an injury is logged with escalating pain levels across multiple entries
   **When** injury_status_log is queried
   **Then** the current escalation stage is retrievable (FR19)

5. **Given** a check-in occurs and the user reports health observations
   **When** `log_session` is called with health observation data (or health-only flag)
   **Then** a health_observations record is created for that date (FR21)

## Tasks / Subtasks

- [x] Task 1: Schema — health_observations table (AC: 1)
  - [x] Define table in schema.ts with unique date, date index
  - [x] Generated in same migration as injury_status_log (0007_overjoyed_cobalt_man.sql)

- [x] Task 2: Extend log_session for health observations (AC: 5)
  - [x] Add healthSchema with sleep_quality (1-5), energy_level (1-5), soreness_level (1-5), notes
  - [x] Write health_observations atomically in transaction
  - [x] Upsert on date (unique constraint)

- [x] Task 3: Support health-only logging for non-session days (AC: 5)
  - [x] Refine validation: allow health-only without exercises or injury
  - [x] No session_logs record created for health-only

- [x] Task 4: Update server.ts tool description

- [x] Task 5: Update coach.md with health observation mode

- [x] Task 6: Tests (AC: 1-5)
  - [x] Health observations logged with session
  - [x] Health-only rest day logging (no session record)
  - [x] Health observations upsert on same date
  - [x] Combined session + injury + health in one call
  - [x] Health values outside 1-5 rejected
  - [x] Nothing-to-do validation (no exercises, no injury, no health)

## Notes

- AC 2 (weekly volume query) — data is available via session_log_entries + exercises join. The actual query tool will be built in Epic 4 (get_progress). The schema and data are in place.
- AC 3 (prehab_completed) — already implemented in Story 3.1.
- AC 4 (escalation stage) — data stored via Story 3.2's injury logging. Claude reads escalation_stage from injury_status_log entries.

## References

- [Source: architecture.md] — health_observations table
- [Source: epics.md#Story 3.3] — acceptance criteria
- [Source: TRAINER.md] — injury protocol, prehab requirements, recovery rules
