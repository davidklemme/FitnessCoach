import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadTrainerContent } from "./trainer-persona.js";

const TRAINER_PATH = "./TRAINER.md";

describe("TRAINER.md content validation (NFR13)", () => {
  it("contains all required sections", () => {
    const content = readFileSync(TRAINER_PATH, "utf-8");
    expect(content).toContain("# Coaching Persona");
    expect(content).toContain("# Safety Guardrails");
    expect(content).toContain("# Injury Protocol");
    expect(content).toContain("# Scheduling Rules");
    expect(content).toContain("# Periodization Framework");
    expect(content).toContain("# Recovery Rules");
  });

  it("sections are separated by horizontal rules for independent updates", () => {
    const content = readFileSync(TRAINER_PATH, "utf-8");
    const sections = content.split("---").filter((s) => s.trim().length > 0);
    expect(sections.length).toBeGreaterThanOrEqual(6);
  });

  it("injury protocol includes pain scale 0-10 and escalation rules", () => {
    const content = readFileSync(TRAINER_PATH, "utf-8");
    expect(content).toContain("**0**");
    expect(content).toContain("**10**");
    expect(content).toContain("Forced rest");
    expect(content).toContain("Escalation Rules");
  });

  it("includes prehab requirements", () => {
    const content = readFileSync(TRAINER_PATH, "utf-8");
    expect(content).toContain("Prehab");
    expect(content).toContain("non-negotiable");
  });
});

describe("loadTrainerContent", () => {
  it("loads TRAINER.md successfully from valid path", () => {
    const result = loadTrainerContent(TRAINER_PATH);
    expect(result.ok).toBe(true);
    expect(result.text).toContain("# Coaching Persona");
  });

  it("returns fallback text when file is missing (NFR8)", () => {
    const result = loadTrainerContent("/nonexistent/TRAINER.md");
    expect(result.ok).toBe(false);
    expect(result.text).toContain("Coaching Persona Unavailable");
  });

  it("returns fallback text when path is a directory", () => {
    const result = loadTrainerContent("./src");
    expect(result.ok).toBe(false);
    expect(result.text).toContain("Unavailable");
  });
});
