---
stepsCompleted:
  - step-01-init
  - step-02-context
  - step-03-starter
  - step-04-decisions
  - step-05-patterns
  - step-06-structure
  - step-07-validation
  - step-08-complete
inputDocuments:
  - prd.md
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-02-12'
project_name: 'FitnessCoach'
user_name: 'David'
date: '2026-02-12'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
34 FRs across 8 capability areas. The system is a data-access layer for Claude — it stores training state, exercise metadata, session history, and injury tracking, then exposes it through MCP tools. Claude (guided by TRAINER.md) does the reasoning. The MCP server makes no coaching decisions.

Key FR clusters by architectural impact:
- **Data CRUD** (FR1-2, FR6-8, FR14-16, FR25-26): Standard read/write against SQLite. These shape the schema.
- **Composite operations** (FR3-5, FR31): Multi-table reads that assemble context for Claude. `check_in` is the most complex — touches all tables.
- **Calendar orchestration** (FR10-13): Fitness Coach MCP does NOT call Google Calendar directly. It provides data; Claude orchestrates calendar reads/writes through the separate Google Workspace MCP.
- **Protocol enforcement** (FR17-20, FR29): Business rules (injury escalation, volume caps, 10% running rule) encoded in TRAINER.md, not in application code. The MCP server tracks data; TRAINER.md tells Claude how to interpret it.
- **Webhook ingestion** (FR22, Phase 2): Separate Express process. Writes health metrics to SQLite. No interaction with MCP server at runtime.

**Non-Functional Requirements:**
13 NFRs. Architecture-shaping ones:
- **NFR3** (idempotent writes): Every write tool needs a deduplication strategy — likely composite keys or upsert patterns.
- **NFR5** (transactional writes): `log_session` writes to multiple tables (session_logs + injury_status_log). Must be atomic.
- **NFR6** (versioned migrations): Need a migration framework from day one. Forward-compatible only.
- **NFR7** (3s response): All tools including `check_in` (which reads all tables). Indexes matter.
- **NFR8** (graceful degradation): Tools must return useful data even when some sources are unavailable. No hard failures on missing optional data.
- **NFR12** (structured logging): Queryable log. `system_status` tool reads it.

**Scale & Complexity:**

- Primary domain: MCP server (developer tool)
- Complexity level: Low-medium
- Estimated architectural components: 5 (MCP server, SQLite DB, migration runner, TRAINER.md resource, webhook sidecar in Phase 2)

### Technical Constraints & Dependencies

- **@modelcontextprotocol/sdk** — defines the tool/resource/prompt interface. Server structure must conform to SDK patterns.
- **better-sqlite3** — synchronous API. No async DB calls. Simplifies tool implementation but blocks the event loop during queries.
- **Google Workspace MCP** — external dependency, already exists. Fitness Coach MCP has no direct calendar access.
- **Single-user, localhost-only** — no auth, no CORS, no TLS. Simplifies everything.
- **Phase 2 concurrency** — webhook sidecar introduces a second writer. SQLite WAL mode is required. Both processes must handle SQLITE_BUSY gracefully.

### Cross-Cutting Concerns Identified

- **Injury status** — queried in 6 of 8 FR groups. Every check-in starts with it. Needs a consistent representation across all tools that return or accept injury data.
- **Idempotency** — all write tools. Needs a uniform approach (composite natural keys vs explicit idempotency tokens).
- **Migration versioning** — schema will evolve across phases. Migration runner must be robust from MVP.
- **Error response format** — all 9 tools must return consistent structured JSON with actionable error messages (NFR1). Needs a shared error envelope.
- **TRAINER.md structure** — not code, but architecturally significant. Its section boundaries affect how easily coaching behavior can be tuned.

## Starter Template Evaluation

### Primary Technology Domain

MCP server (developer tool) with stdio transport. TypeScript, local-first, single-user.

### Starter Options Considered

| Starter | Verdict | Reason |
|---|---|---|
| MCP Server Starter (TheSethRose) | Rejected | Too minimal — no DB, no resources, no migration infrastructure |
| mcp-server-starter-ts (alexanderop) | Rejected | Modular but lacks SQLite integration and migration framework |
| MCP TypeScript Template (nickytonline) | Rejected | HTTP/Express focused — wrong transport model (we need stdio) |
| Custom scaffold from SDK examples | **Selected** | SDK examples provide exact patterns needed; project needs custom structure |

### Selected Approach: Custom Scaffold

**Rationale:** No existing MCP server starter provides the combination of SQLite integration, migration framework, and resource loading this project requires. The `@modelcontextprotocol/sdk` examples demonstrate the exact patterns for tool registration, resource serving, and stdio transport. Custom scaffold avoids inheriting unnecessary abstractions.

**Initialization:** `npm init` + manual dependency installation.

**Verified Dependencies (production):**

| Package | Version | Purpose |
|---|---|---|
| `@modelcontextprotocol/sdk` | ^1.26.0 | MCP server framework (v1.x stable branch) |
| `drizzle-orm` | latest | Type-safe ORM, schema-as-code, SQLite driver |
| `better-sqlite3` | ^12.6.2 | SQLite database driver (Drizzle's SQLite backend) |
| `zod` | ^3.x | Schema validation for tool inputs |
| `dotenv` | latest | Environment variable loading |

**Verified Dependencies (development):**

| Package | Purpose |
|---|---|
| `typescript` | Language compiler |
| `drizzle-kit` | Migration generation from schema diffs |
| `@types/better-sqlite3` | Type definitions |
| `vitest` | Test framework (aligned with SDK's own test tooling) |
| `tsx` | TypeScript execution for development |
| `tsup` | esbuild-based bundler for single output file |

**Node.js Requirement:** v22 LTS (better-sqlite3 incompatible with v24)

**Security Notes:**
- CVE-2026-25536 (cross-client data leak) — affects shared HTTP transport only. Stdio transport unaffected.
- CVE-2025-66414 (DNS rebinding) — affects HTTP servers on localhost. Stdio transport unaffected.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Data layer: Drizzle ORM + SQLite (schema-as-code, type-safe, migration generation)
- MCP tool response format: SDK-native errors, structured JSON content
- Build tooling: tsup (single bundled output)

**Important Decisions (Shape Architecture):**
- Logging: SQLite log table (queryable by `system_status`)
- Environment config: dotenv + zod validation
- Idempotency: composite natural keys
- Seed data: Drizzle migration files

**Deferred Decisions (Post-MVP):**
- Authentication: No HTTP layer exists to protect. Revisit when/if HTTP endpoints are introduced.
- PostgreSQL: Drizzle abstracts the dialect. Upgrade path preserved if needed.
- API key storage in DB: Keys in `.env` for MVP. DB storage optional Phase 2.
- Encryption: No threat model justifies it for local-only single-user DB.

### Data Architecture

| Decision | Choice | Rationale |
|---|---|---|
| ORM | Drizzle ORM | Schema-as-code, type-safe queries, built-in migration generation. Replaces raw better-sqlite3 and custom migration runner. |
| Database | SQLite via `better-sqlite3` (Drizzle driver) | Local-first, zero config, no Docker/cloud dependency. WAL mode for Phase 2 concurrency. Drizzle preserves Postgres upgrade path. |
| Migrations | `drizzle-kit` | Generates SQL migrations from schema diffs. Forward-compatible. No custom runner needed. |
| Idempotency | Composite natural keys | MCP tool calls come from Claude, not distributed retries. `log_session` deduplicates on (date, session_type). Upsert resolves retries. |
| Seed data | SQL seed via Drizzle migration | Exercise library as INSERT statements in a migration file. Version-controlled, reviewable, no loader code. |
| Schema validation | Zod | Tool input validation. Drizzle handles DB-level types. Zod validates what Claude sends before it hits the DB. |

### Authentication & Security

| Decision | Choice | Rationale |
|---|---|---|
| Authentication | None (MVP) | MCP server uses stdio transport — no HTTP endpoints to protect. Webhook sidecar (Phase 2) binds 127.0.0.1 only. No attack surface. |
| API keys | `.env` file | dotenv + zod validation at startup. Cal.com API key added in Phase 2. DB storage deferred. |
| Encryption | None | Single-user, local-only DB file. Encryption adds key management complexity with no threat model to justify it. |

### API & Communication Patterns

| Decision | Choice | Rationale |
|---|---|---|
| Error handling | MCP SDK native | `isError: true` with descriptive message for failures. No custom envelope. SDK already solved this. |
| Success response shape | Domain object + `_meta` | Each tool returns domain data at top level. Optional `_meta: { asOf, source }` for context. No `{ success: true }` wrapper. |
| Transport | stdio | MCP server communicates via stdin/stdout. No HTTP layer in MVP. |
| Calendar integration | Cross-MCP orchestration | Fitness Coach MCP provides data. Claude orchestrates calendar reads/writes through Google Workspace MCP. No direct calendar API calls. |

### Infrastructure & Deployment

| Decision | Choice | Rationale |
|---|---|---|
| Build tooling | tsup | esbuild-based bundler. Single output file for clean MCP server registration. Fast builds. |
| Logging | SQLite `system_logs` table | Structured, queryable with SQL. `system_status` tool reads directly. Schema: `(timestamp, level, source, message, metadata_json)`. No extra dependency. |
| Environment config | dotenv + zod | Load `.env`, validate schema at startup, fail fast with clear messages. |
| Node.js version | v22 LTS | Required by better-sqlite3. Incompatible with v24. |
| Package manager | npm | Standard. No workspace needed for MVP (single package). |

### Decision Impact Analysis

**Implementation Sequence:**
1. Project scaffold + tsup build + Node.js v22 enforcement
2. Drizzle schema + drizzle-kit migrations + SQLite connection
3. Exercise library seed migration
4. MCP server registration (tools, resources) via SDK
5. Tool implementations against Drizzle queries
6. TRAINER.md resource loading
7. Logging table + `system_status` tool

**Cross-Component Dependencies:**
- Drizzle schema → all tool implementations (every tool queries through Drizzle)
- tsup build → MCP server registration (config points to bundled output)
- Zod schemas → tool input validation (defined alongside tool handlers)
- `system_logs` table → `system_status` tool (reads log entries)
- TRAINER.md → `trainer://persona` resource (file path in .env or convention)

## Implementation Patterns & Consistency Rules

### Naming Patterns

**Database (Drizzle schema):**
- Tables: `snake_case`, plural — `session_logs`, `exercises`, `plans`
- Columns: `snake_case` — `created_at`, `joint_stress_rating`, `plan_id`
- Foreign keys: `{referenced_table_singular}_id` — `exercise_id`, `plan_id`
- Indexes: `idx_{table}_{columns}` — `idx_session_logs_date`
- Drizzle table variables: camelCase matching table — `export const sessionLogs = sqliteTable('session_logs', ...)`

**TypeScript code:**
- Files: `kebab-case.ts` — `get-current-plan.ts`, `exercise-library.ts`
- Functions/variables: `camelCase` — `getCurrentPlan`, `exerciseId`
- Types/interfaces: `PascalCase` — `SessionLog`, `ExerciseMetadata`
- Constants: `SCREAMING_SNAKE` — `MAX_PAIN_THRESHOLD`, `DEFAULT_DELOAD_PERCENT`
- Zod schemas: `camelCase` + `Schema` suffix — `logSessionSchema`, `checkInSchema`

**MCP tool names:** `snake_case` — `get_current_plan`, `log_session`, `check_in`

### Structure Patterns

**Test location:** Co-located. `src/tools/get-current-plan.ts` → `src/tools/get-current-plan.test.ts`

**Tool organization:** One file per tool in `src/tools/`. Each file exports a single tool handler function. Tool registration in `src/server.ts`.

**Schema organization:** All Drizzle schema in `src/db/schema.ts` (single file for MVP). Split to `src/db/schema/` directory if growth exceeds 15 tables.

**Shared code:** `src/lib/` for utilities. `src/db/` for database connection and schema. `src/types/` only if types must be shared across tool boundaries.

### Format Patterns

**MCP response JSON (in `content[0].text`):**
- camelCase keys — `{ currentPlan: {...}, sessions: [...] }`
- Dates: ISO 8601 strings — `"2026-02-12T10:00:00Z"`
- Nulls: omit the key. Conditionally present fields are either there or absent.
- Arrays: always arrays, even for single items — `sessions: [...]`
- Pain scales: integers 0-10, never strings
- Optional metadata: `_meta: { asOf, source }` — present when useful, omitted when not

**Logging (`system_logs` table):**
- Levels: `debug`, `info`, `warn`, `error` — lowercase strings
- Source: tool name or component — `get_current_plan`, `migration`, `startup`
- Metadata: JSON string — `{"exerciseId": 42, "duration": 1.2}`

### Process Patterns

**Error handling:**
- Zod validation first — parse tool inputs, return descriptive error if invalid
- DB errors caught per-tool, logged to `system_logs`, returned via SDK `isError: true`
- Never throw unhandled — every tool wrapped in try/catch
- Error messages actionable for Claude: "No active plan found. Use update_plan to create one." not "NOT_FOUND"

**Transactions:**
- Any tool writing to 2+ tables uses `db.transaction()` (Drizzle wraps better-sqlite3 transactions)
- Read-only tools: no transaction needed

**Validation sequence (every tool):**
1. Zod-parse input → fail fast with schema error
2. Business validation (does the referenced plan/exercise exist?) → fail with domain error
3. Execute query/mutation
4. Return structured JSON

### Enforcement Guidelines

**All AI agents MUST:**
- Run `drizzle-kit generate` after any schema change — never hand-write migrations
- Co-locate tests with source files
- Use the Zod → business validation → execute → respond sequence for every tool
- Return ISO 8601 dates, never formatted strings or timestamps
- Log errors to `system_logs` before returning error responses

**Anti-patterns (never do):**
- Creating a `utils.ts` catch-all — put utilities in domain-specific modules
- Adding `try/catch` inside `db.transaction()` — let the transaction handler manage rollback
- Returning `{ success: false }` — use SDK's `isError: true`
- Hardcoding TRAINER.md path — read from env config

## Project Structure & Boundaries

### Complete Project Directory Structure

```
FitnessCoach/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── drizzle.config.ts
├── vitest.config.ts
├── .env.example
├── .env
├── .gitignore
├── .nvmrc                          # Node v22 LTS
├── TRAINER.md                      # Coaching persona (highest-leverage artifact)
├── drizzle/
│   └── migrations/                 # Generated by drizzle-kit, never hand-edited
│       ├── 0000_init.sql
│       └── 0001_seed_exercises.sql
├── src/
│   ├── index.ts                    # Entry point: create server, connect stdio transport
│   ├── server.ts                   # McpServer setup: register all tools + resources
│   ├── config.ts                   # dotenv + zod env validation
│   ├── db/
│   │   ├── connection.ts           # better-sqlite3 + Drizzle instance, WAL mode setup
│   │   ├── schema.ts              # All Drizzle table definitions
│   │   ├── queries.ts             # Shared query functions used by multiple tools
│   │   └── migrate.ts             # Run migrations on startup
│   ├── tools/
│   │   ├── get-current-plan.ts     # FR1, FR3
│   │   ├── get-current-plan.test.ts
│   │   ├── update-plan.ts          # FR2, FR4, FR5
│   │   ├── update-plan.test.ts
│   │   ├── log-session.ts          # FR6, FR7, FR8
│   │   ├── log-session.test.ts
│   │   ├── get-exercise-library.ts # FR14, FR15, FR16
│   │   ├── get-exercise-library.test.ts
│   │   ├── get-progress.ts         # FR25, FR26, FR28, FR29
│   │   ├── get-progress.test.ts
│   │   ├── check-in.ts             # FR17, FR21, FR31, FR32, FR33, FR34
│   │   ├── check-in.test.ts
│   │   ├── system-status.ts        # NFR12
│   │   └── system-status.test.ts
│   ├── resources/
│   │   └── trainer-persona.ts      # FR30 — loads TRAINER.md, serves trainer://persona
│   ├── lib/
│   │   └── logger.ts              # Writes to system_logs table
│   └── types/
│       └── tool-responses.ts      # Shared response type definitions (if needed)
└── dist/
    └── index.js                    # tsup bundled output (MCP config points here)
```

### Architectural Boundaries

**MCP Tool Boundary:** Each tool in `src/tools/` is a self-contained unit: Zod schema + handler function + test. Tools import from `src/db/` for queries and `src/lib/logger.ts` for logging. Tools never import from each other.

**Database Boundary:** All DB access goes through `src/db/connection.ts`. No tool directly instantiates a database connection. Schema is the single source of truth in `src/db/schema.ts`.

**Resource Boundary:** `src/resources/trainer-persona.ts` owns TRAINER.md loading. It reads the file path from env config, loads the file, and serves it as `trainer://persona`. No other module reads TRAINER.md.

**External Integration:** Fitness Coach MCP has zero external API calls. Calendar integration happens through Claude orchestrating between this MCP and Google Workspace MCP. The boundary is the MCP tool response — this server returns data, Claude decides what to do with it.

### FR Category to File Mapping

| FR Category | Files | Key Tables |
|---|---|---|
| Training Plan Management (FR1-5) | `get-current-plan.ts`, `update-plan.ts` | `plans`, `plan_sessions` |
| Session Logging (FR6-9) | `log-session.ts` | `session_logs`, `injury_status_log` |
| Calendar Integration (FR10-13) | No dedicated tool — Claude orchestrates via response data | — |
| Exercise Library (FR14-16) | `get-exercise-library.ts` | `exercises` |
| Injury Protocol (FR17-20) | `check-in.ts`, `log-session.ts` | `injury_status_log` |
| Health Data (FR21-24) | `check-in.ts` (manual MVP), Phase 2 tools | `health_metrics` (Phase 2) |
| Progress & Goals (FR25-29) | `get-progress.ts` | `session_logs`, `benchmarks` |
| Coaching Persona (FR30-34) | `trainer-persona.ts`, `check-in.ts` | — |

### Data Flow

```
Claude Code session
    ↓ (stdio)
MCP Server (src/index.ts)
    ↓ (tool dispatch)
Tool handler (src/tools/*.ts)
    ↓ (Drizzle queries)
SQLite DB (fitness-coach.db)
    ↑ (JSON response)
Tool handler → MCP Server → Claude
    ↓ (Claude orchestrates)
Google Workspace MCP → Google Calendar
```

### Development Workflow

- `npm run dev` — `tsx watch src/index.ts` for development
- `npm run build` — `tsup src/index.ts` → `dist/index.js`
- `npm run test` — `vitest run`
- `npm run db:generate` — `drizzle-kit generate` after schema changes
- `npm run db:migrate` — `drizzle-kit migrate` to apply migrations

### Phase 2 Additions

```
src/
├── tools/
│   ├── get-health-summary.ts       # FR22, FR23, FR24
│   └── get-murph-readiness.ts      # FR27
├── prompts/
│   ├── daily-checkin.ts
│   ├── weekly-review.ts
│   └── monthly-progress.ts
webhook-sidecar/                     # Separate package
├── package.json
├── src/
│   ├── index.ts                    # Express server, 127.0.0.1 only
│   ├── routes/
│   │   └── health-data.ts          # POST /health — validates + writes to SQLite
│   └── schema/
│       └── health-export.ts        # Zod schema for Health Auto Export payload
└── dist/
```

## Architecture Validation Results

### Coherence Validation

- **Decision compatibility:** All technology choices verified compatible. No version conflicts. Drizzle + better-sqlite3 + SDK + tsup + vitest all work together.
- **Pattern consistency:** Naming conventions (snake_case DB → camelCase TS → snake_case MCP tools), test co-location, and validation sequences all align with stack choices.
- **Structure alignment:** Project tree supports all decisions. Boundaries properly defined. Every component has a clear home.

### Requirements Coverage

- **34/34 FRs covered**: 26 in MVP, 8 correctly deferred to Phase 2 (FR9, FR13, FR22-24, FR27)
- **13/13 NFRs covered**: 10 in MVP, 3 correctly deferred to Phase 2 (NFR2, NFR10, and Phase 2 aspects of NFR12)
- **Zero orphaned requirements**: Every FR maps to specific files and tables in the FR Category to File Mapping

### Gap Analysis

**One gap identified and resolved:**
- `check_in` tool shares query logic with `get-current-plan`, `get-progress`, and `log-session`. Adding `src/db/queries.ts` as a shared query layer in the DB boundary. Tools compose from shared queries without importing each other. Project structure updated.

**No other gaps found.** All decisions trace cleanly to requirements.

### Architecture Completeness Checklist

- [x] Project context analyzed, scale assessed, constraints identified
- [x] Critical decisions documented with verified versions
- [x] Technology stack fully specified with security notes
- [x] Implementation patterns comprehensive (naming, structure, format, process)
- [x] Complete directory structure with FR-to-file mapping
- [x] Component boundaries defined and enforced
- [x] Data flow documented
- [x] Development workflow commands specified
- [x] Phase 2 structure planned but not over-specified

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**
- Thin server, smart persona — intelligence in TRAINER.md, not application code
- Drizzle provides clean upgrade path to Postgres if ever needed
- One-file-per-tool pattern makes the codebase easy to navigate and test
- Every decision has explicit rationale traceable to PRD requirements

**Areas for Future Enhancement:**
- TRAINER.md structure/format (will emerge from actual coaching sessions)
- Exercise library completeness (seed with basics, iterate)
- `check_in` tool complexity may warrant decomposition after real usage

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries
- Refer to this document for all architectural questions

**First Implementation Priority:**
1. `npm init` + install dependencies (production + dev)
2. Configure tsup, tsconfig, drizzle, vitest
3. Define Drizzle schema in `src/db/schema.ts`
4. Run `drizzle-kit generate` + seed exercise library
5. Wire MCP server with stdio transport in `src/index.ts`
