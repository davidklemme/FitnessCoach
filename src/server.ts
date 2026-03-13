import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getExerciseLibrarySchema,
  getExerciseLibrary,
} from "./tools/get-exercise-library.js";
import { registerTrainerPersona } from "./resources/trainer-persona.js";
import { systemStatus } from "./tools/system-status.js";
import { getCurrentPlan } from "./tools/get-current-plan.js";
import {
  updatePlan,
  updatePlanSchema,
} from "./tools/update-plan.js";
import {
  logSession,
  logSessionSchema,
} from "./tools/log-session.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, "..", "package.json"), "utf-8")
    );
    return pkg.version ?? "1.0.0";
  } catch {
    return "1.0.0";
  }
}

export const server = new McpServer({
  name: "fitness-coach",
  version: getVersion(),
});

registerTrainerPersona(server);

server.tool(
  "get_exercise_library",
  "Browse and search the exercise library. Filter by location type, equipment, joint stress rating, or muscle group. Returns exercises with full metadata including progression ladders.",
  getExerciseLibrarySchema,
  async (params) => getExerciseLibrary(params)
);

server.tool(
  "get_current_plan",
  "View the current active training plan with mesocycle phase, week number, and all scheduled sessions with exercise details.",
  {},
  async () => getCurrentPlan()
);

server.tool(
  "update_plan",
  "Create or modify the training plan. Actions: 'create' (new plan with sessions/exercises), 'swap_exercise' (replace an exercise), 'adjust_volume' (change sets/reps), 'deload' (reduce volume ~50%), 'injury_adjust' (substitute exercises for affected muscle groups, or restore originals with pain_level 0). Pass action and action-specific fields as a JSON object.",
  { input: z.string().describe("JSON object with 'action' field and action-specific parameters. See tool description for available actions.") },
  async (params) => {
    let raw: unknown;
    try {
      raw = JSON.parse(params.input);
    } catch {
      return {
        content: [{ type: "text" as const, text: "Invalid JSON input. Provide a valid JSON object with an 'action' field." }],
        isError: true,
      };
    }
    const parsed = updatePlanSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        content: [{ type: "text" as const, text: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` }],
        isError: true,
      };
    }
    return updatePlan(parsed.data);
  }
);

server.tool(
  "log_session",
  "Log a completed workout session, ad-hoc injury, or health observations. For sessions: pass exercises array with sets/reps/RPE. For injuries: set ad_hoc_injury=true with injury object (pain_level 0-10, location, affected_areas). For health: pass health object (sleep_quality, energy_level, soreness_level 1-5). All can be combined. Upserts sessions on (date, session_type, session_order), health observations on date.",
  { input: z.string().describe("JSON object with date, session_type, and exercises/injury/health data. See tool description for modes.") },
  async (params) => {
    let raw: unknown;
    try {
      raw = JSON.parse(params.input);
    } catch {
      return {
        content: [{ type: "text" as const, text: "Invalid JSON input. Provide a valid JSON object with date, session_type, and exercises." }],
        isError: true,
      };
    }
    const parsed = logSessionSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        content: [{ type: "text" as const, text: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` }],
        isError: true,
      };
    }
    return logSession(parsed.data);
  }
);

server.tool(
  "system_status",
  "Check MCP server operational health. Returns DB file size, server uptime, recent error count, and last log entry.",
  {},
  async () => systemStatus()
);
