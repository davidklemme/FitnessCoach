# Story 1.5: Structured Logging & System Status

Status: review

## Story

As a user,
I want to check the operational health of the MCP server,
so that I can verify data integrity and diagnose issues.

## Acceptance Criteria

1. **Given** the `system_logs` table exists with columns: timestamp, level, source, message, metadata_json
   **When** any tool encounters an error
   **Then** `src/lib/logger.ts` writes a structured log entry before returning the error response (NFR1)

2. **Given** the `system_status` tool is called
   **When** Claude invokes it
   **Then** it returns: DB file size, last session logged timestamp, server uptime, recent error count (NFR12)
   **And** the response is structured JSON with actionable context

3. **Given** log entries exist at various levels (debug, info, warn, error)
   **When** `system_status` queries logs
   **Then** it can filter and summarize by level and time range

## Tasks / Subtasks

- [x] Task 1: Logger utility (AC: 1)
  - [x] Create `src/lib/logger.ts` — writes to system_logs table
  - [x] Support levels: debug, info, warn, error
  - [x] Accept source, message, optional metadata object
  - [x] Serialize metadata to JSON string

- [x] Task 2: system_status tool (AC: 2, 3)
  - [x] Create `src/tools/system-status.ts`
  - [x] Return DB file size, server uptime, recent error count, last log entry
  - [x] Register tool in `src/server.ts`

- [x] Task 3: Wire logger into existing tools (AC: 1)
  - [x] Update get_exercise_library error path to log before returning isError

- [x] Task 4: Tests (AC: 1, 2, 3)
  - [x] `src/lib/logger.test.ts` — 4 tests
  - [x] `src/tools/system-status.test.ts` — 6 tests
  - [x] All 39 tests pass

## References

- [Source: architecture.md#Infrastructure & Deployment] — logging table schema
- [Source: architecture.md#Process Patterns] — error handling, log before return
- [Source: epics.md#Story 1.5] — acceptance criteria
