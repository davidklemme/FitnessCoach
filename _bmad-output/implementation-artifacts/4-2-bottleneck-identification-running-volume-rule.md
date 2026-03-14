# Story 4.2: Bottleneck Identification & Running Volume Rule

Status: review

## Story

As a user,
I want the coach to identify which exercises are behind target and enforce safe running progression,
So that training focus is directed where it matters most and injury risk is managed.

## Acceptance Criteria

1. **Given** benchmarks exist with target and current values for multiple goal components
   **When** `get_progress` is called
   **Then** components where current_value is behind expected progression rate are flagged as bottlenecks (FR28)
   **And** bottlenecks are ranked by gap severity (largest gap first)

2. **Given** session logs contain running sessions over the past 2+ weeks
   **When** `get_progress` is called for running data
   **Then** weekly running volume (total distance) is calculated from session_logs
   **And** the week-over-week increase percentage is returned
   **And** any week exceeding 10% increase over the previous week is flagged (FR29)

3. **Given** no session logs or benchmarks exist yet
   **When** `get_progress` is called
   **Then** the response indicates no data available with an actionable message, not an error

## Tasks / Subtasks

- [x] Task 1: Add bottleneck detection to get_progress (AC: 1)
  - [x] Compare currentValue to targetValue for each benchmark with data
  - [x] Handle numeric (reps, kg) and time-based (running_5k) units
  - [x] Calculate percentComplete, filter <100%, sort by lowest first
  - [x] Omit bottlenecks section when none are behind

- [x] Task 2: Add running volume analysis to get_progress (AC: 2)
  - [x] Identify running exercises via name LIKE '%run%'
  - [x] Sum distance from weight field per ISO week
  - [x] Calculate week-over-week increase percentage
  - [x] Flag weeks exceeding 10% increase (FR29, TRAINER.md strict rule)

- [x] Task 3: Handle no-data case gracefully (AC: 3)
  - [x] Running volume: actionable message when no running data exists
  - [x] Bottlenecks: section omitted when no benchmarks have current values

- [x] Task 4: Tests — 8 new tests (20 total in get-progress.test.ts)
  - [x] Bottleneck: ranked by gap severity, time-based handling, meets target, no current values
  - [x] Running volume: weekly calculation, >10% flag, no data message, first week no %
  - [x] All 135 tests pass

## References

- [Source: architecture.md#FR Category to File Mapping] — get-progress.ts handles FR25-29
- [Source: TRAINER.md] — 10% running volume rule
- [Source: epics.md#Story 4.2] — acceptance criteria
