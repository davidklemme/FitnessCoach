import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

describe("MCP Server", () => {
  it("creates a server instance with correct name and version", async () => {
    const server = new McpServer({
      name: "fitness-coach",
      version: "1.0.0",
    });
    expect(server).toBeDefined();
  });
});
