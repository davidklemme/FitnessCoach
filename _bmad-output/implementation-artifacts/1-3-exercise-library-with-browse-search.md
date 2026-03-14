# Story 1.3: Exercise Library with Browse & Search

Status: in-progress

## Story

As a user,
I want to browse and search exercises filtered by location, equipment, duration, and joint stress,
so that the coach can match exercises to my situation and constraints.

## Acceptance Criteria

1. **Given** the `exercises` table exists with columns: name, location_type, equipment_required, min_duration, joint_stress_rating, muscle_groups, progression_ladder
   **When** the seed migration runs
   **Then** the exercise library is populated with bodyweight-focused exercises including progression ladders (FR15)

2. **Given** the `get_exercise_library` tool is called with no filters
   **When** Claude invokes it
   **Then** all exercises are returned with full metadata (FR16)

3. **Given** the `get_exercise_library` tool is called with filter parameters (location_type, equipment, max_joint_stress, muscle_group)
   **When** Claude invokes it
   **Then** only matching exercises are returned (FR14)
   **And** each exercise includes its progression ladder (FR15)
   **And** the response completes within 3 seconds (NFR7)

## Tasks / Subtasks

- [ ] Task 1: Exercise schema (AC: 1)
  - [ ] Add `exercises` table to `src/db/schema.ts`
  - [ ] Columns: id, name, location_type, equipment_required, min_duration, joint_stress_rating, muscle_groups (JSON text), progression_ladder (JSON text)
  - [ ] Run `npm run db:generate` to produce migration

- [ ] Task 2: Seed exercise data (AC: 1)
  - [ ] Create seed migration with bodyweight-focused exercises
  - [ ] Include progression ladders for key exercises (pull-ups, push-ups, squats, dips, rows)
  - [ ] Cover location types: home, outdoor, gym, pool, anywhere
  - [ ] Include joint stress ratings and muscle group metadata

- [ ] Task 3: get_exercise_library tool (AC: 2, 3)
  - [ ] Create `src/tools/get-exercise-library.ts`
  - [ ] Zod input schema for optional filters: location_type, equipment, max_joint_stress, muscle_group
  - [ ] Query exercises table with dynamic WHERE clauses based on provided filters
  - [ ] Return all exercises when no filters, filtered set when filters provided
  - [ ] Register tool in `src/server.ts`

- [ ] Task 4: Tests (AC: 1, 2, 3)
  - [ ] `src/tools/get-exercise-library.test.ts` — tool returns exercises, filters work, progression ladders included
  - [ ] All existing tests still pass

## Dev Notes

### Architecture Compliance

**Tool pattern (from architecture):**
- One file per tool in `src/tools/`
- Zod → business validation → execute → respond sequence
- SDK-native error handling (`isError: true`)
- Success response: domain object at top level + optional `_meta`
- MCP tool name: `get_exercise_library` (snake_case)

**Schema pattern:**
- Table: `exercises` (snake_case, plural)
- Drizzle variable: `export const exercises = sqliteTable('exercises', ...)`
- JSON fields stored as text, parsed in application layer

**Seed data (from architecture):**
- Exercise library seeded via SQL INSERT in a migration file
- Bodyweight-focused exercises with progression ladders

### References

- [Source: architecture.md#Data Architecture] — seed data as migration
- [Source: architecture.md#Project Structure & Boundaries] — FR14-16 mapping
- [Source: epics.md#Story 1.3] — acceptance criteria
