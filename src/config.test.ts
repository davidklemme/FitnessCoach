import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

describe("config validation", () => {
  const envSchema = z.object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    TRAINER_MD_PATH: z.string().min(1, "TRAINER_MD_PATH is required"),
  });

  it("accepts valid environment variables", () => {
    const result = envSchema.safeParse({
      DATABASE_URL: "./fitness-coach.db",
      TRAINER_MD_PATH: "./TRAINER.md",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing DATABASE_URL", () => {
    const result = envSchema.safeParse({
      TRAINER_MD_PATH: "./TRAINER.md",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty DATABASE_URL", () => {
    const result = envSchema.safeParse({
      DATABASE_URL: "",
      TRAINER_MD_PATH: "./TRAINER.md",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing TRAINER_MD_PATH", () => {
    const result = envSchema.safeParse({
      DATABASE_URL: "./fitness-coach.db",
    });
    expect(result.success).toBe(false);
  });
});
