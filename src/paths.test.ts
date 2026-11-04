import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stateDir } from "./paths.js";

describe("stateDir", () => {
  const having = (...names: string[]) => (p: string) => names.some((n) => p.endsWith(n));

  it("uses .bytehive when it exists", () => {
    expect(stateDir("D:/app", having(".bytehive", ".maestro"))).toBe(join("D:/app", ".bytehive"));
  });

  it("falls back to .maestro for a folder not moved yet", () => {
    expect(stateDir("D:/app", having(".maestro"))).toBe(join("D:/app", ".maestro"));
  });

  it("starts a new folder on .bytehive", () => {
    expect(stateDir("D:/app", having())).toBe(join("D:/app", ".bytehive"));
  });
});
