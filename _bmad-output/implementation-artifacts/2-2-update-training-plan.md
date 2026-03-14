# Story 2.2: Update Training Plan

Status: done

## Story

As a user,
I want to create and modify my training plan by swapping exercises, adjusting volume, or triggering a deload,
So that the plan evolves with my progress and recovery needs.

## Acceptance Criteria

1. **Given** no active plan exists
   **When** `update_plan` is called with `action: 'create'` and mesocycle details
   **Then** a new plan is created with all sessions and exercise assignments
   **And** exercises are validated against the exercise library via FK

2. **Given** `update_plan` accepts a discriminated union on `action` field
   **When** the Zod input schema is defined
   **Then** it supports distinct action types: `create`, `swap_exercise`, `adjust_volume`, `deload`, `injury_adjust`, `schedule_confirm`, `schedule_cancel`, `schedule_reject`

3. **Given** an active plan exists
   **When** `update_plan` is called with `action: 'swap_exercise'`
   **Then** the plan_session_exercises record is updated with the new exercise (FK validated)

4. **Given** an active plan exists
   **When** `update_plan` is called with `action: 'adjust_volume'`
   **Then** the plan_session_exercises volume targets are updated

5. **Given** an active plan exists
   **When** `update_plan` is called with `action: 'deload'`
   **Then** volume is reduced per deload rules and plan phase reflects the deload

6. **Given** `update_plan` is called twice with identical parameters
   **When** both calls execute
   **Then** the result is the same as a single call (NFR3)

## Tasks / Subtasks

- [x] Task 1: Zod discriminated union schema (AC: 2)
  - [x] All 8 action types defined with per-action fields
  - [x] Future actions (injury_adjust, schedule_*) return not-yet-implemented

- [x] Task 2: Create action (AC: 1, 6)
  - [x] Create plan + sessions + exercises in transaction
  - [x] Deactivates any existing active plan first
  - [x] FK validates exercise IDs

- [x] Task 3: Swap exercise action (AC: 3)
  - [x] Updates plan_session_exercises.exercise_id
  - [x] Validates new exercise exists + old entry exists

- [x] Task 4: Adjust volume action (AC: 4)
  - [x] Updates sets/reps on plan_session_exercises

- [x] Task 5: Deload action (AC: 5)
  - [x] Reduces sets by ~50% (min 1) in transaction
  - [x] Updates plan phase to 'deload'

- [x] Task 6: Register tool in server.ts
  - [x] JSON string input with internal discriminated union validation

- [x] Task 7: Tests (AC: 1-6)
  - [x] `src/tools/update-plan.test.ts` — 18 tests
  - [x] All 73 tests pass

## References

- [Source: architecture.md#Process Patterns] — transactions, validation sequence, idempotency
- [Source: epics.md#Story 2.2] — acceptance criteria
