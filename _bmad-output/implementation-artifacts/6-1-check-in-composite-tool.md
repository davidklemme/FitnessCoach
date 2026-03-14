# Story 6.1: Check-in Composite Tool

Status: review

## Story

As a user,
I want a single check-in tool that assembles my full coaching context,
So that the coach has everything needed for an informed conversation without multiple tool calls.

## Acceptance Criteria

1. **Given** the `check_in` tool is called
   **When** it executes
   **Then** it returns a structured response with sections: current injury status, recent health observations, last session summary, and upcoming plan preview (FR31)
   **And** shared queries in `src/db/queries.ts` are used for cross-table reads without importing other tool modules

2. **Given** the database has data across all tables (plans, sessions, injuries, exercises, benchmarks)
   **When** `check_in` is called
   **Then** the response completes within 3 seconds (NFR7)

3. **Given** some data sources are empty (no session logs yet, no injury history, no health observations)
   **When** `check_in` is called
   **Then** present sections are returned with data and missing sections are omitted gracefully (NFR8)
   **And** the response never fails due to missing optional data

4. **Given** the `check_in` tool is called
   **When** injury data exists
   **Then** injury status appears first in the response, enabling TRAINER.md's injury-first check-in pattern (FR17 data support)

## Dev Notes

- Shared query layer in `src/db/queries.ts` — does NOT import other tool modules
- Dependency injection: `checkIn(database)` accepts optional DB parameter for testing
- Empty state returns actionable message ("No data available yet")
- Null-omission pattern: optional fields only included when non-null
