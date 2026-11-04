import { describe, expect, it, vi } from "vitest";
import { PlainWords, askPrompt, parseMuseReply, verdictPrompt } from "./muse.js";

describe("Muse prompts", () => {
  it("gives the model the facts behind a red verdict", () => {
    const p = verdictPrompt({
      name: "Ana",
      reason: "Not done: stub or TODO left in the changed code.",
      files: ["src/upload.ts"],
      stub: "src/upload.ts:12 // TODO retry",
    });
    expect(p).toContain("Ana");
    expect(p).toContain("src/upload.ts:12");
    expect(p).toContain("no tools");
  });

  it("names the risk of a question", () => {
    const p = askPrompt({ name: "Bob", question: "Run this?", detail: "git push --force", risk: "force push rewrites shared history" });
    expect(p).toContain("git push --force");
    expect(p).toContain("force push rewrites shared history");
  });
});

describe("parseMuseReply", () => {
  it("takes the last line with words on it", () => {
    expect(parseMuseReply("thinking\n\nThe upload is not finished.\n\n")).toBe("The upload is not finished.");
  });

  it("drops Muse's own log lines and quotes", () => {
    expect(parseMuseReply('"Not finished."\nmuse: trimmed catalog\n')).toBe("Not finished.");
  });

  it("is null for an empty reply", () => {
    expect(parseMuseReply("  \n")).toBeNull();
  });

  it("keeps a runaway reply short", () => {
    expect(parseMuseReply("x".repeat(500))!.length).toBeLessThanOrEqual(220);
  });
});

describe("PlainWords", () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("asks once per key and shows the answer when it lands", async () => {
    const run = vi.fn(async () => "Plain sentence.");
    const words = new PlainWords(run);
    expect(words.get("k", () => "p")).toBeNull();
    expect(words.get("k", () => "p")).toBeNull();
    await settle();
    expect(words.get("k", () => "p")).toBe("Plain sentence.");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs one call at a time", async () => {
    let live = 0;
    let most = 0;
    const words = new PlainWords(async () => {
      most = Math.max(most, ++live);
      await settle();
      live--;
      return "ok";
    });
    words.get("a", () => "p");
    words.get("b", () => "p");
    await new Promise((r) => setTimeout(r, 200));
    expect(most).toBe(1);
    expect(words.get("b", () => "p")).toBe("ok");
  });

  it("survives a failed call", async () => {
    const words = new PlainWords(async () => { throw new Error("no login"); });
    words.get("k", () => "p");
    await settle();
    expect(words.get("k", () => "p")).toBeNull();
  });

  it("does nothing when the model is off", () => {
    expect(new PlainWords(null).get("k", () => "p")).toBeNull();
  });
});
