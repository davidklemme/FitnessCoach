# Story 2.3: Injury-Responsive Plan Adjustment

Status: done

## Story

As a user,
I want the coach to adjust my plan when I report an injury, substituting exercises based on what's affected,
So that I keep training safely without manually rebuilding the plan.

## Acceptance Criteria

1. **Given** an active plan exists and an injury is reported with affected body areas and pain level
   **When** `update_plan` is called with `action: 'injury_adjust'` (affected_areas, pain_level)
   **Then** exercises in upcoming sessions that stress affected areas are identified
   **And** for each substitution, the original exercise_id is stored in an `original_exercise_id` field on plan_session_exercises (preserving pre-injury state)
   **And** alternative exercises with low joint stress on affected areas are queried from the exercise library
   **And** substitutions are applied to upcoming plan sessions (FR5)

2. **Given** no suitable alternative exercises exist for a session
   **When** substitution is attempted
   **Then** the session is flagged for review rather than silently dropping exercises
   **And** the response communicates which sessions need manual adjustment

3. **Given** the injury clears (pain returns to 0)
   **When** `update_plan` is called with `action: 'injury_adjust'` and pain_level 0
   **Then** plan_session_exercises with non-null `original_exercise_id` are reverted to their original exercise_id

## Tasks / Subtasks

- [x] Task 1: Schema migration — add `original_exercise_id` column (AC: 1, 3)
  - [x] Add nullable `original_exercise_id` FK to plan_session_exercises
  - [x] Generate migration via drizzle-kit (0005_flaky_sphinx.sql)

- [x] Task 2: Implement injury_adjust action (AC: 1, 2)
  - [x] Find active plan and its exercises
  - [x] Match affected_areas against exercise muscleGroups (case-insensitive)
  - [x] Query exercise library for low-joint-stress alternatives (jointStressRating <= 3)
  - [x] Apply substitutions in transaction, storing originals
  - [x] Flag sessions with no suitable alternatives
  - [x] Skip already-substituted entries (idempotent)

- [x] Task 3: Implement restore on pain_level 0 (AC: 3)
  - [x] Find entries with non-null original_exercise_id in active plan
  - [x] Revert exercise_id, clear original_exercise_id

- [x] Task 4: Update coach.md with injury_adjust action

- [x] Task 5: Tests (AC: 1-3)
  - [x] `src/tools/update-plan.test.ts` — 26 tests (5 new)
  - [x] All 81 tests pass

## References

- [Source: architecture.md#Cross-Cutting Concerns] — injury status queried across tools
- [Source: epics.md#Story 2.3] — acceptance criteria
