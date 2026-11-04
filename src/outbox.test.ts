import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendOutboxLine, buildOutboxLine, MAX_DIRECT_CHARS, rescueBody } from "./outbox.js";

describe("buildOutboxLine", () => {
  it("writes one JSON line the fleet bridge drains", () => {
    const line = buildOutboxLine({ from: "Supervisor", to: "Ana", message: "retry step 3", now: 7 });
    expect(line.endsWith("\n")).toBe(true);
    expect(JSON.parse(line)).toEqual({ from: "Supervisor", to: "Ana", message: "retry step 3", now: 7 });
  });
});

describe("rescueBody", () => {
  it("sends short text straight through", () => {
    expect(rescueBody("nudge: retry step 3", "h.txt")).toEqual({ kind: "direct", text: "nudge: retry step 3" });
  });
  it("points at a file past one burst", () => {
    const long = "x".repeat(MAX_DIRECT_CHARS + 1);
    const body = rescueBody(long, "rescue/ana-3.md");
    expect(body.kind).toBe("file");
    if (body.kind === "file") expect(body.pointer).toContain("rescue/ana-3.md");
  });
});

describe("appendOutboxLine", () => {
  it("creates .bytehive/outbox.jsonl and appends", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sup-outbox-"));
    await appendOutboxLine(dir, "line one\n");
    await appendOutboxLine(dir, "line two\n");
    const content = await readFile(join(dir, ".bytehive", "outbox.jsonl"), "utf8");
    expect(content).toBe("line one\nline two\n");
  });
});
