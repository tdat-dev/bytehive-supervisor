import { describe, expect, it } from "vitest";
import { readAgentSummary, slugPane, summaryPath } from "./selfsummary.js";

describe("slugPane", () => {
  it("lowercases and dashes non-alphanumerics", () => {
    expect(slugPane("Claude Code 0k5qww")).toBe("claude-code-0k5qww");
    expect(slugPane("A__B!!")).toBe("a-b");
    expect(slugPane("  x ")).toBe("x");
  });

  it("falls back to agent when nothing slug-worthy remains", () => {
    expect(slugPane("")).toBe("agent");
    expect(slugPane("---")).toBe("agent");
  });
});

describe("summaryPath", () => {
  it("points inside the project state dir", () => {
    const p = summaryPath("/w/proj", "Codex 1");
    expect(p.replace(/\\/g, "/")).toBe("/w/proj/.bytehive/summary-codex-1.md");
  });
});

describe("readAgentSummary", () => {
  it("returns null when the file is missing or blank", () => {
    const missing = () => { throw new Error("ENOENT"); };
    expect(readAgentSummary("/w", "a", missing)).toBeNull();
    expect(readAgentSummary("/w", "a", () => "  \n \n")).toBeNull();
  });

  it("collapses newlines to one line", () => {
    const text = readAgentSummary("/w", "a", () => "Doing: login form\nBlocked: no\nNext: tests\n");
    expect(text).toBe("Doing: login form Blocked: no Next: tests");
  });

  it("truncates over-long summaries with an ellipsis", () => {
    const text = readAgentSummary("/w", "a", () => "x".repeat(600));
    expect(text!.length).toBeLessThanOrEqual(500);
    expect(text!.endsWith("…")).toBe(true);
  });

  it("reads the slugged path", () => {
    let seen = "";
    readAgentSummary("/w/proj", "Claude Code 1", (p) => { seen = p; return "ok"; });
    expect(seen.replace(/\\/g, "/")).toBe("/w/proj/.bytehive/summary-claude-code-1.md");
  });
});
