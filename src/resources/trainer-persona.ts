import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../config.js";

const FALLBACK_TEXT =
  "# Coaching Persona Unavailable\n\nTRAINER.md not found or unreadable. Coaching will proceed without persona guidance.";

export function loadTrainerContent(path: string): {
  text: string;
  ok: boolean;
} {
  try {
    return { text: readFileSync(path, "utf-8"), ok: true };
  } catch {
    return { text: FALLBACK_TEXT, ok: false };
  }
}

export function registerTrainerPersona(server: McpServer) {
  // Check at registration time so warning appears at startup
  const startup = loadTrainerContent(config.TRAINER_MD_PATH);
  if (!startup.ok) {
    console.warn(
      `TRAINER.md not found at ${config.TRAINER_MD_PATH}. Coaching persona unavailable.`
    );
  }

  server.resource("trainer-persona", "trainer://persona", {
    description:
      "Coaching persona, injury protocols, scheduling rules, periodization framework, and recovery rules",
    mimeType: "text/markdown",
    async load() {
      const { text } = loadTrainerContent(config.TRAINER_MD_PATH);
      return {
        contents: [
          {
            uri: "trainer://persona",
            mimeType: "text/markdown",
            text,
          },
        ],
      };
    },
  });
}
