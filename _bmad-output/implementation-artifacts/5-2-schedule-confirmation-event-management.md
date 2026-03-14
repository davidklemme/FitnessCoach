# Story 5.2: Schedule Confirmation & Event Management

Status: review

## Story

As a user,
I want to confirm, reschedule, or cancel scheduled sessions with calendar event references,
So that my training plan stays synchronized with my Google Calendar.

## Acceptance Criteria

1. **Given** `plan_sessions` has scheduling columns
   **When** migration runs
   **Then** existing plan_sessions are preserved with null scheduling fields

2. **Given** a schedule is proposed and the user approves
   **When** `update_plan` is called with schedule_confirm
   **Then** sessions are marked as scheduled with event references (FR4, FR11)

3. **Given** the user wants to cancel a scheduled session
   **When** `update_plan` is called with schedule_cancel
   **Then** scheduling is cleared and orphaned calendar_event_id is returned (FR12)

4. **Given** the user rejects the proposed schedule
   **When** `update_plan` is called with schedule_reject
   **Then** no changes occur (FR4)

## Tasks / Subtasks

- [x] Task 1: Schema — Add scheduling columns to plan_sessions
  - [x] scheduled_status, calendar_event_id, scheduled_datetime (all nullable)
  - [x] Generate migration 0012_closed_red_wolf.sql

- [x] Task 2: Implement schedule_confirm action (AC: 2)
  - [x] Accept array of confirmations (session_id, datetime, calendar_event_id)
  - [x] Validate sessions belong to active plan
  - [x] Update in transaction, report failures per-session

- [x] Task 3: Implement schedule_cancel action (AC: 3)
  - [x] Clear scheduled_status, calendar_event_id, scheduled_datetime
  - [x] Return orphaned calendar_event_id for cleanup

- [x] Task 4: Implement schedule_reject action (AC: 4)
  - [x] Return no-change confirmation

- [x] Task 5: Include scheduling fields in get_current_plan response
  - [x] scheduledStatus, calendarEventId, scheduledDatetime (null-omission pattern)

- [x] Task 6: Tests — 4 new tests (31 total in update-plan.test.ts)
  - [x] schedule_confirm: confirms sessions, reports invalid session IDs
  - [x] schedule_cancel: clears scheduling, returns orphaned event ID
  - [x] schedule_reject: no-change response
  - [x] All 141 tests pass

## References

- [Source: architecture.md#Calendar Integration] — Claude orchestrates calendar via response data
- [Source: epics.md#Story 5.2] — acceptance criteria
