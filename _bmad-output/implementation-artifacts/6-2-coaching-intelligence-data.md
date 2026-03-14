# Story 6.2: Coaching Intelligence Data

Status: review

## Story

As a user,
I want the coach to flag skipped sessions, recommend recovery, and escalate serious injuries,
So that the coaching is proactive about consistency, recovery, and safety.

## Acceptance Criteria

1. **Given** planned sessions exist for the past week and some were not logged
   **When** `check_in` is called
   **Then** the response includes a skipped_sessions array listing planned-but-unlogged sessions with dates and session types (FR32)

2. **Given** session logs from the past 7 days show high training load (multiple high-RPE sessions, consecutive training days)
   **When** `check_in` is called
   **Then** the response includes a training_load summary with total sessions, average RPE, rest days taken (FR33)
   **And** TRAINER.md can use this data to recommend rest days

3. **Given** the most recent injury_status_log entry has a pain_level at or above the defined severity threshold
   **When** `check_in` is called
   **Then** the response includes a severity_alert flag with the pain level and location (FR34)
   **And** TRAINER.md can respond with "see a doctor" guidance

4. **Given** no skipped sessions, normal training load, and no injury alerts exist
   **When** `check_in` is called
   **Then** the coaching intelligence fields are absent from the response (no false alarms)

## Dev Notes

- Severity threshold: pain >= 8 triggers `severityAlert`
- Skipped sessions: compares plan_sessions day_of_week against actual session_logs dates for past 7 days
- Training load: totalSessions, averageRpe (rounded to 1 decimal), restDays from past 7 days
- All coaching intelligence sections omitted when clean (no false alarms)
