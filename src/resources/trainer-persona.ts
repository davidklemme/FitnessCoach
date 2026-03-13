import { readFileSync, existsSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../config.js";

export function registerTrainerPersona(server: McpServer) {
  server.resource("trainer-persona", "trainer://persona", {
    description:
      "Coaching persona, injury protocols, scheduling rules, periodization framework, and recovery rules",
    mimeType: "text/markdown",
    async load() {
      const path = config.TRAINER_MD_PATH;

      if (!existsSync(path)) {
        console.warn(
          `TRAINER.md not found at ${path}. Coaching persona unavailable.`
        );
        return {
          contents: [
            {
              uri: "trainer://persona",
              mimeType: "text/markdown",
              text: "# Coaching Persona Unavailable\n\nTRAINER.md not found. Coaching will proceed without persona guidance.",
            },
          ],
        };
      }

      try {
        const content = readFileSync(path, "utf-8");
        return {
          contents: [
            {
              uri: "trainer://persona",
              mimeType: "text/markdown",
              text: content,
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.warn(`Failed to read TRAINER.md: ${message}`);
        return {
          contents: [
            {
              uri: "trainer://persona",
              mimeType: "text/markdown",
              text: `# Coaching Persona Unavailable\n\nFailed to read TRAINER.md: ${message}`,
            },
          ],
        };
      }
    },
  });
}
