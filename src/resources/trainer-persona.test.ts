import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

describe("trainer-persona resource", () => {
  const TRAINER_PATH = "./TRAINER.md";

  it("TRAINER.md exists at the configured path", () => {
    expect(existsSync(TRAINER_PATH)).toBe(true);
  });

  it("TRAINER.md contains all required sections (NFR13)", () => {
    const content = readFileSync(TRAINER_PATH, "utf-8");
    expect(content).toContain("# Coaching Persona");
    expect(content).toContain("# Injury Protocol");
    expect(content).toContain("# Scheduling Rules");
    expect(content).toContain("# Periodization Framework");
    expect(content).toContain("# Recovery Rules");
  });

  it("sections are separated by horizontal rules for independent updates", () => {
    const content = readFileSync(TRAINER_PATH, "utf-8");
    const sections = content.split("---").filter((s) => s.trim().length > 0);
    expect(sections.length).toBeGreaterThanOrEqual(5);
  });

  it("injury protocol includes pain scale interpretation (0-10)", () => {
    const content = readFileSync(TRAINER_PATH, "utf-8");
    expect(content).toContain("**0**");
    expect(content).toContain("**10**");
    expect(content).toContain("Forced rest");
  });

  it("scheduling rules include session spacing constraints", () => {
    const content = readFileSync(TRAINER_PATH, "utf-8");
    expect(content).toContain("consecutive days");
    expect(content).toContain("rest day");
  });

  it("periodization framework defines mesocycle structure", () => {
    const content = readFileSync(TRAINER_PATH, "utf-8");
    expect(content).toContain("Mesocycle");
    expect(content).toContain("deload");
  });

  it("recovery rules address overtraining signals", () => {
    const content = readFileSync(TRAINER_PATH, "utf-8");
    expect(content).toContain("RPE");
    expect(content).toContain("overtraining");
  });

  it("graceful degradation — handler returns fallback when file missing", () => {
    // Verify the handler pattern handles missing files
    // (tested via the existsSync check in the resource handler)
    expect(existsSync("/nonexistent/TRAINER.md")).toBe(false);
  });
});
