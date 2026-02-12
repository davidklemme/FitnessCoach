---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation-skipped
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
inputDocuments: []
documentCounts:
  briefs: 0
  research: 0
  projectDocs: 0
  projectContext: 0
workflowType: 'prd'
projectType: 'greenfield'
classification:
  projectType: developer_tool
  domain: health_fitness
  complexity: medium
  projectContext: greenfield
---

# Product Requirements Document - FitnessCoach

**Date:** 2026-02-12

## Executive Summary

FitnessCoach is a personal fitness coaching system powered by Claude, accessed via Claude Code check-in sessions. It combines an MCP server (training logic, exercise library, session tracking), calendar integration (Google Workspace MCP for reads/writes, Cal.com for multi-calendar aggregation in Phase 2), and Apple Watch health data (via webhook sidecar in Phase 2) to deliver intelligent workout scheduling, progressive overload management, and injury-aware training adaptation.

**Target user:** Solo intermediate athlete, 5+ sessions/week target, training toward a specific fitness goal (e.g., Dirty Murph). Recurring injury management (e.g., tendon inflammation) is a primary training constraint.

**Core differentiator:** The coach has full context — health data, calendar availability, training history, injury status — and reasons about scheduling and programming through natural conversation. No autonomous engine; the coach proposes, the user approves. Intelligence lives in TRAINER.md and Claude's reasoning, not in application logic.

**Architecture:** Three MCP servers (Fitness Coach, Cal.com, Google Workspace) + a health webhook sidecar. Local-first, single-user, zero recurring cost.

## Success Criteria

### User Success

- **Workout adherence**: 5+ sessions/week over rolling 4-week average
- **Schedule integration**: Coach proposes workouts in viable calendar slots, user approves, events appear on Google Calendar
- **Injury management**: Zero multi-week derailments from recurring injury. Prehab compliance tracked. Flares caught within 1 session and deloaded immediately.
- **Check-in efficiency**: Under 10 minutes per session in Claude Code. Coach has full context, asks the right questions.
- **Injury adaptation**: Ad-hoc status changes (injury, illness, travel) trigger intelligent replanning without manual plan rebuilding.

### Business Success

- **Personal retention**: Still actively using at 12 months
- **Open source**: Public repo. Community pickups welcome but not a goal.
- **No recurring cost**: Cal.com self-hosted. Claude Code is the interface. Zero API costs.

### Technical Success

- **Three MCP servers coexist cleanly** in one Claude session without conflicts
- **Health webhook reliability**: Watch data ingested daily without manual intervention (Phase 2)
- **Data integrity**: SQLite is the single source of truth. No data loss across sessions.
- **Session continuity**: Coach picks up where it left off — last session, current plan phase, health data, upcoming schedule

### Measurable Outcomes

- **Goal readiness by target date**: Dirty Murph (partitioned) — 1mi run, 100 pull-ups, 200 push-ups, 300 squats, 1mi run. Benchmarked every 4-6 weeks.
- **Pull-up progression**: Tracked from current baseline to goal volume (sets of 5+ for 20 sets). Weekly volume tracked with tendon-safe caps.
- **Running progression**: Base building toward 15K. 10% weekly volume rule enforced.
- **Consistency**: 80%+ planned session completion rate over any 4-week window.

## Product Scope & Phased Development

### Phase 1 — MVP

**MVP Approach:** Problem-solving MVP — functional coaching brain with calendar awareness. Health data automation and multi-calendar aggregation layer on after the core loop is validated.

**Resource Requirements:** Solo developer. TypeScript, MCP SDK, SQLite. No external services beyond existing Google Workspace MCP.

**Core User Journeys Supported:**
- Journey 1: Weekly Planning Check-in (Google Calendar only)
- Journey 2: Post-Session Debrief
- Journey 3: Ad-hoc Status Change

**Must-Have Capabilities:**
- TRAINER.md — coaching persona, injury protocol, scheduling rules, periodization framework
- SQLite schema + seeded exercise library (bodyweight focus, progression ladders, joint stress ratings)
- MCP tools: `get_current_plan`, `update_plan`, `log_session`, `get_exercise_library`, `get_progress`, `check_in`, `system_status`
- Calendar read/write via existing Google Workspace MCP
- Injury status tracking with escalation protocol
- Health data entered manually during check-in conversations (no webhook)

### Phase 2 — Growth

- Health webhook sidecar (Watch data ingestion via Health Auto Export)
- `get_health_summary` and `get_murph_readiness` tools
- Cal.com MCP server (unified availability across multiple calendar providers)
- MCP Prompts: `daily_checkin`, `weekly_review`, `monthly_progress`
- Recovery scoring (composite from HRV, sleep, resting HR)
- SQLite WAL mode for concurrent MCP + webhook access

### Phase 3 — Vision

- Voice interface on iPhone when Claude mobile supports MCP
- Swimming and gym workout programming
- Nutrition awareness (if data source becomes available)
- Shareable as a template for other users to fork and customize

### Risk Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| MVP only sees Google Calendar — misses other calendar blocks | Scheduling conflicts | User manually mentions known conflicts. Cal.com in Phase 2 solves it. |
| Manual health data entry is friction | User skips it, coach loses context | Keep it lightweight — "how'd you sleep? any pain?" is 10 seconds. Webhook in Phase 2 automates it. |
| TRAINER.md quality determines coaching quality | Bad persona = useless system | Invest real effort. Iterate based on actual sessions. |
| Progression stalls due to recurring injury | Goal timeline at risk | Injury protocol non-negotiable from day one. |

## User Journeys

### Journey 1: Weekly Planning Check-in — "Plan My Week, Coach"

**Sunday evening.** The user opens Claude Code and spins up the coach. No workouts planned for the week yet.

The coach already knows: Watch data shows two runs last week, one push session, zero pull-ups. Sleep averaged 6.2 hours. HRV trending down. It's week 3 of a 4-week mesocycle block.

"Any pain or injury updates?" — coach asks first, every time.

"No issues this week."

The coach pulls the calendar for the next two weeks. Monday: meetings until 14:00, then a commitment at 16:00 — there's a 90-minute window. Tuesday: clear morning until 11:30. Wednesday: packed. Thursday: open afternoon. Friday: light day. Weekend: flexible.

Coach proposes:
- **Monday 14:15**: Upper body calisthenics (home, 45 min) — prehab + push/pull work
- **Tuesday 07:00**: Fasted 7K run — building base
- **Thursday 13:00**: Full strength session — push/pull/legs with band work. Prehab first.
- **Friday 07:30**: Easy 5K recovery run
- **Saturday 09:00**: Pull-up focused session + core. Low volume, slow eccentrics.

The user looks at Monday — "I could do a quick outdoor set at the park instead." Coach adjusts: swaps home calisthenics for park circuit, shortens to 30 min, keeps prehab.

User approves. Five events appear on Google Calendar.

**Reveals:** Calendar read, health data query, plan state awareness, exercise-to-slot matching (duration, location, equipment), injury status check, event creation with approval flow, in-session plan modification.

### Journey 2: Post-Session Debrief — "How'd It Go?"

**Tuesday evening.** The user ran this morning — Watch captured it. Quick check-in via Claude Code.

Coach already has the Watch data: 7.1K run, 38 minutes, avg HR 152, 480 calories. Cross-references the plan: target was 7K.

"7.1K, solid. HR was a bit high for an easy run — were you pushing pace or was it hilly?"

"Pushed a bit on the last kilometer, felt good."

Coach logs the session: planned 7K, actual 7.1K, subjective effort moderate, HR slightly elevated. Notes the pace push as a positive signal for running progression.

"Any pain?" — always.

"No."

"Thursday's your strength session. Current plan has 3 sets of banded pull-ups and 4 sets push-ups. Injury has been clean for 2 weeks — want to try a set of slow negatives mixed in?"

The user hesitates. "One set. Let's see."

Coach updates Thursday's session: 2 sets banded pull-ups, 1 set slow negatives (5-second eccentric), 4 sets push-ups. Prehab protocol stays non-negotiable. Done in 4 minutes.

**Reveals:** Watch data ingestion, plan vs actual comparison, subjective feedback capture, injury status tracking, progressive overload suggestions respecting injury protocol, session logging.

### Journey 3: Ad-hoc Status Change — "I Broke My Toe"

**Wednesday morning.** The user stubbed a pinky toe badly yesterday. It's swollen.

"Broke my pinky toe. Or at least badly bruised."

"Which foot? Can you walk on it? Scale of 1-10 on weight-bearing pain?"

"Left. Can walk but running is out. Maybe a 6."

Coach pulls the current week plan. Thursday: strength. Friday: 5K run. Saturday: pull-up focus.

"Running is out until you can weight-bear pain-free. Adjustment:
- **Thursday**: Keep strength but replace standing exercises with seated/floor alternatives. Pull-up work stays. Add extra core.
- **Friday**: Swap run for swimming if pool access works, or upper body + core at home.
- **Saturday**: Keep as planned — pull-up bar work is fine.
- **Running**: Parked until pain below 3 on weight-bearing. I'll ask every check-in."

User approves. Coach updates calendar events, logs the injury, flags running as suspended with a recheck trigger.

**Reveals:** Injury impact assessment across plan, intelligent exercise substitution, calendar event modification, injury tracking with recovery triggers, ongoing monitoring protocol.

### Journey 4: Progress Review — "Am I On Track?"

**First Sunday of the month.** Monthly review.

Coach pulls the numbers for all goal components — pull-ups, push-ups, squats, running. Shows current benchmarks vs targets, progression rates, and projected completion dates.

"Push-ups on track. Squats ahead of schedule. Running fine. **Pull-ups are the bottleneck.** At current progression, you'll hit volume targets by [projected date] if consistent and injury cooperates. Zero tolerance for skipping pull-up sessions."

**Reveals:** Benchmark tracking, goal projection, per-exercise progress trending, bottleneck identification, periodization awareness, goal timeline validation.

### Journey 5: Health Data Flow — The Silent Pipeline

**No user action.** Every night, Health Auto Export sends a JSON payload to the webhook sidecar. Sleep duration, sleep stages, HRV, resting heart rate, VO2max, active calories, workout summaries.

The sidecar validates the schema, deduplicates by timestamp, writes to SQLite. No alerts, no notifications.

Next check-in, the coach has fresh data. HRV trending down for 3 days? Coach flags it. Sleep below 6 hours consistently? Coach adjusts intensity. No manual health data entry needed.

**Reveals:** Webhook endpoint, JSON schema validation, deduplication, passive data collection. (Phase 2)

### Journey Requirements Summary

| Capability | J1 Planning | J2 Debrief | J3 Ad-hoc | J4 Progress | J5 Health |
|---|---|---|---|---|---|
| Calendar read (availability) | **Core** | | | | |
| Calendar write (events) | **Core** | | **Core** | | |
| Health data query | **Core** | **Core** | | **Core** | |
| Plan state read/write | **Core** | **Core** | **Core** | **Core** | |
| Session logging | | **Core** | | | |
| Exercise library + matching | **Core** | **Core** | **Core** | | |
| Injury status tracking | **Core** | **Core** | **Core** | **Core** | |
| Injury/status management | | | **Core** | | |
| Progress/benchmark tracking | | | | **Core** | |
| Goal projection | | | | **Core** | |
| Webhook ingestion | | | | | **Core** |
| Structured check-in prompt | **Core** | **Core** | | | |

## Domain-Specific Requirements

### Health Data Privacy & Safety

- **Webhook endpoint**: Localhost-only (`127.0.0.1`). No network exposure.
- **Data scope**: Personal health metrics stored locally in SQLite. No cloud storage, no sharing, no HIPAA applicability.
- **Medical boundaries**: Coach interprets health trends for training decisions only. Does not diagnose. Pain above defined thresholds triggers "see a doctor," not a training adjustment.
- **Data accuracy**: Watch data is consumer-grade approximation. Coach treats it as directional signal, not clinical measurement.

### Data Durability

- **No backup infrastructure for MVP.** Most data recoverable from Apple Health re-export or seed data. Irreplaceable data (session logs, injury reports, subjective feedback) is low-volume and accepted risk.
- **Future option**: Cron-to-cloud-folder backup if session log history becomes valuable enough to protect.

## Developer Tool Specific Requirements

### Project-Type Overview

Two TypeScript packages: an MCP server and a standalone webhook sidecar. Designed for Claude Code (and Claude Desktop in future). Single-user, local-first, no cloud deployment.

### MCP Tool Surface — Fitness Coach MCP Server

| Tool | Purpose | Reads | Writes |
|---|---|---|---|
| `get_current_plan` | Mesocycle, phase, week, scheduled sessions | plans, plan_sessions | — |
| `update_plan` | Modify sessions, trigger deload, swap exercises | plans, plan_sessions, exercises | plans, plan_sessions |
| `log_session` | Record exercises, sets, reps, RPE, notes, injury status | exercises | session_logs, injury_status_log |
| `get_health_summary` | Latest Watch data: sleep, HRV, resting HR, VO2max (Phase 2) | health_metrics | — |
| `get_progress` | Trends per exercise, per goal, over time | session_logs, benchmarks | — |
| `get_exercise_library` | Search/browse exercises with filters (location, equipment, duration, joint stress) | exercises | — |
| `get_murph_readiness` | Projected goal completion from current benchmarks (Phase 2) | benchmarks, session_logs | — |
| `check_in` | Structured flow: injury status → health review → session review → plan preview | all tables | session_logs, injury_status_log |
| `system_status` | Operational health: last webhook received, DB size, last session logged, uptime | system metadata | — |

### MCP Resources

| Resource | Purpose |
|---|---|
| `trainer://persona` | TRAINER.md — coaching persona, injury protocol, scheduling rules, periodization framework. Auto-loaded as context. |

### MCP Prompts (Phase 2)

| Prompt | Purpose |
|---|---|
| `daily_checkin` | Structured daily interaction: status → last session review → next session preview |
| `weekly_review` | Weekly planning: health trends → calendar scan → propose 2-week schedule |
| `monthly_progress` | Monthly deep dive: goal projection, progress tracking, plan phase assessment |

### Tech Stack

| Component | Technology | Purpose |
|---|---|---|
| MCP Server | TypeScript, `@modelcontextprotocol/sdk` | Core fitness coach tools, resources, prompts |
| Database | `better-sqlite3` | Local persistent storage for all training data |
| Schema Validation | `zod` | Input validation for all tool parameters and webhook payloads |
| Webhook Sidecar | TypeScript, `express` | Health Auto Export data ingestion, `127.0.0.1` only (Phase 2) |

### Installation & Configuration

- MCP server registered in `claude_desktop_config.json` or Claude Code MCP settings
- Webhook sidecar runs as a separate process (`pm2`, `launchd`, or manual) (Phase 2)
- Environment configuration via `.env`: SQLite DB path, webhook port, Cal.com API key (Phase 2)
- Exercise library seeded via database migration on first run

### Implementation Considerations

- **MCP protocol compliance**: All tools return structured JSON. Tool descriptions clear enough for Claude to select the right tool autonomously.
- **SQLite concurrency**: WAL mode for concurrent reads during writes (required when webhook sidecar is added in Phase 2).
- **Stateless tools**: Each MCP tool call is independent. Session context lives in Claude's context, not in the MCP server.
- **TRAINER.md quality**: This file IS the coach. It drives Claude's reasoning about periodization, injury management, scheduling, and persona. Highest-leverage artifact in the system.

## Functional Requirements

### Training Plan Management

- **FR1**: The user can view the current training plan including mesocycle phase, week number, and all scheduled sessions
- **FR2**: The user can modify the training plan by swapping exercises, adjusting volume, or triggering a deload
- **FR3**: The coach can propose a 2-week workout schedule based on current plan phase and available calendar slots
- **FR4**: The user can approve, modify, or reject a proposed schedule before events are created
- **FR5**: The coach can adjust the plan in response to injury or status changes, substituting exercises based on impact assessment

### Session Logging & Tracking

- **FR6**: The user can log a completed session with exercises performed, sets, reps, RPE, and free-text notes
- **FR7**: The user can record injury status (pain 0-10, location, trigger exercise) at every check-in
- **FR8**: The user can log ad-hoc injuries or status changes with severity and affected body areas
- **FR9**: The system can compare planned vs actual session data when Watch workout data is available (Phase 2)

### Calendar Integration

- **FR10**: The coach can read the user's Google Calendar to identify free windows within scheduling constraints (configurable time bounds, meeting buffers, blackout periods)
- **FR11**: The coach can create workout events on the user's Google Calendar with session details (type, duration, exercises)
- **FR12**: The coach can modify or cancel existing workout events when plan changes are approved
- **FR13**: The coach can read unified availability across multiple calendar providers via Cal.com API (Phase 2)

### Exercise Library

- **FR14**: The user can browse and search the exercise library filtered by location type, equipment required, duration, and joint stress rating
- **FR15**: The system maintains progression ladders for each exercise (e.g., banded pull-ups → negatives → clean → volume)
- **FR16**: Each exercise has metadata: minimum duration, location type (home/outdoor/gym/pool/anywhere), equipment required, joint stress rating, muscle groups targeted

### Injury Protocol

- **FR17**: The coach asks about injury status at the start of every check-in
- **FR18**: The system enforces non-negotiable prehab exercises before every push/pull session
- **FR19**: The system escalates through injury protocol stages: monitor → reduce volume → swap to low-impact alternatives → forced rest when pain thresholds are exceeded
- **FR20**: The system tracks weekly push/pull volume caps and enforces tendon-safe progression rates

### Health Data & Recovery

- **FR21**: The user can report health observations manually during check-in (sleep quality, energy, soreness)
- **FR22**: The system can ingest Apple Watch health data via webhook (sleep, HRV, resting HR, VO2max, workout summaries) (Phase 2)
- **FR23**: The coach can flag concerning health trends (declining HRV, poor sleep patterns) and recommend intensity adjustments (Phase 2)
- **FR24**: The system can compute a composite recovery score from available health data (Phase 2)

### Progress & Goals

- **FR25**: The user can view progress trends for any tracked exercise over time
- **FR26**: The user can view current benchmarks for all goal components (e.g., pull-ups, push-ups, squats, running for Murph)
- **FR27**: The system can project goal readiness based on current progression rates and remaining time (Phase 2)
- **FR28**: The system identifies bottleneck exercises that are behind target for goal completion
- **FR29**: The coach enforces the 10% weekly volume rule for running progression

### Coaching Persona & Check-in Flow

- **FR30**: The system loads TRAINER.md as context to establish the coaching persona
- **FR31**: The coach can conduct a structured check-in flow: injury status → health/status review → last session review → upcoming plan preview
- **FR32**: The coach calls out skipped sessions and inconsistency based on plan vs actual data
- **FR33**: The coach respects recovery as training — recommends rest days based on training load and health signals
- **FR34**: The coach recognizes injury severity thresholds and responds with "see a doctor" when appropriate

## Non-Functional Requirements

### Integration Reliability

- **NFR1**: MCP tool calls must return structured JSON with clear error messages on failure. Claude needs actionable error context to communicate failures.
- **NFR2**: Health webhook sidecar must validate incoming JSON against the Health Auto Export schema and reject malformed payloads with logged errors, not silent drops (Phase 2).
- **NFR3**: All write operations (session logging, plan updates, calendar events) must be idempotent — retried tool calls must not create duplicate records or side effects.

### Data Integrity

- **NFR4**: SQLite must use foreign key enforcement to prevent orphaned records.
- **NFR5**: All writes must be transactional — partial session logs must not occur.
- **NFR6**: All schema changes applied via versioned, forward-compatible migrations that preserve existing data.

### Performance

- **NFR7**: All MCP tool calls must complete within 3 seconds, including composite tools like `check_in`.

### Resilience

- **NFR8**: MCP tools must function with partial data availability. Missing calendar data, health data, or Cal.com access must not block coaching — the coach degrades to conversational input for unavailable data sources.

### Operational

- **NFR9**: MCP server must start and connect to Claude within 5 seconds of launch.
- **NFR10**: Webhook sidecar must run as a persistent process without manual restart (`launchd`, `pm2`, or equivalent) (Phase 2).
- **NFR11**: Environment configuration (DB path, webhook port, API keys) externalized in `.env`. No hardcoded values.
- **NFR12**: MCP server and webhook sidecar must log errors and key operations to a queryable log. `system_status` tool reports operational health: last webhook received, DB size, last session logged, uptime.

### Maintainability

- **NFR13**: TRAINER.md must be structured with clearly separated concerns (persona, injury protocol, scheduling rules, periodization framework, recovery rules) so sections can be updated independently.
