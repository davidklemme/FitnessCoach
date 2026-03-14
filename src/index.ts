import "./config.js";
import { runMigrations } from "./db/migrate.js";
import { server } from "./server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { setServerStartTime } from "./tools/system-status.js";

async function main() {
  runMigrations();
  setServerStartTime(Date.now());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
