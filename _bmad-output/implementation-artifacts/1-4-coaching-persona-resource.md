# Story 1.4: Coaching Persona Resource

Status: in-progress

## Story

As a user,
I want Claude to have my coaching persona loaded automatically,
so that every interaction reflects the training philosophy, injury protocols, and scheduling rules.

## Acceptance Criteria

1. **Given** `TRAINER.md` exists at the path specified in `.env`
   **When** the MCP server starts
   **Then** `src/resources/trainer-persona.ts` loads the file and registers it as resource `trainer://persona`

2. **Given** Claude reads the `trainer://persona` resource
   **When** the content is returned
   **Then** it contains clearly separated sections: persona, injury protocol, scheduling rules, periodization framework, recovery rules (NFR13)
   **And** each section can be updated independently without affecting others

3. **Given** `TRAINER.md` is missing or unreadable
   **When** the MCP server starts
   **Then** the server logs a warning but does not crash (NFR8)

## Tasks / Subtasks

- [ ] Task 1: TRAINER.md content (AC: 2)
  - [ ] Create `TRAINER.md` with clearly separated sections per NFR13
  - [ ] Sections: persona, injury protocol, scheduling rules, periodization framework, recovery rules

- [ ] Task 2: Resource handler (AC: 1, 3)
  - [ ] Create `src/resources/trainer-persona.ts`
  - [ ] Load TRAINER.md from path in config
  - [ ] Export a function to register the resource on the MCP server
  - [ ] Handle missing file gracefully — log warning, don't crash

- [ ] Task 3: Register resource in server.ts (AC: 1)
  - [ ] Import and call registration function in `src/server.ts`

- [ ] Task 4: Tests (AC: 1, 2, 3)
  - [ ] `src/resources/trainer-persona.test.ts`
  - [ ] All existing tests still pass

## Dev Notes

### Architecture Compliance

- Resource URI: `trainer://persona`
- TRAINER.md path from `config.TRAINER_MD_PATH`
- NFR8: graceful degradation when file missing
- NFR13: clearly separated sections for independent updates

### References

- [Source: architecture.md#Project Structure & Boundaries] — resources/trainer-persona.ts
- [Source: architecture.md#FR Category to File Mapping] — FR30
- [Source: epics.md#Story 1.4] — acceptance criteria
