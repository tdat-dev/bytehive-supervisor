import { describe, expect, it } from "vitest";
import { actionMessage, evidenceRows, headline, keptVerdict, orderAgents, panelAgent, type AgentFacts, type PanelAgent } from "./panelstate.js";
import { verdictDone, type DoneEvidence } from "./verdict.js";

const facts = (over: Partial<AgentFacts> = {}): AgentFacts => ({
  id: "1", name: "Ana", project: "api", status: "active", alert: null, verdict: null, ask: null, ...over,
});

const verdict = (e: Partial<DoneEvidence>, stubs: { file: string; line: number; text: string }[] = []) => {
  const evidence: DoneEvidence = { diffFiles: ["a.ts"], testsPass: true, boardDone: true, hasStubOrTodo: stubs.length > 0, ...e };
  return { result: verdictDone(evidence), evidence, stubs };
};

describe("panelAgent", () => {
  it("is green and quiet while an agent works", () => {
    const a = panelAgent(facts());
    expect(a).toMatchObject({ light: "green", line: "Ana is running fine.", rescue: null, recheck: false });
  });

  it("turns a stuck alert into a red light with a rescue button", () => {
    const a = panelAgent(facts({ alert: { agentId: "1", name: "Ana", projectDir: "", kind: "no-output", detail: "Ana produced no output for 12m" } }));
    expect(a).toMatchObject({ light: "red", line: "Ana produced no output for 12m", rescue: { kind: "nudge", label: "Nudge" } });
  });

  it("flips red on a fake done, with the reason and a Recheck", () => {
    const a = panelAgent(facts({ verdict: verdict({}, [{ file: "a.ts", line: 3, text: "// TODO retry" }]) }));
    expect(a).toMatchObject({ light: "red", recheck: true, sendBack: true, line: "Not done: stub or TODO left in the changed code." });
    expect(a.evidence.map((e) => e.label)).toContain("a.ts:3  // TODO retry");
  });

  it("goes green when the evidence checks out", () => {
    expect(panelAgent(facts({ verdict: verdict({}) }))).toMatchObject({ light: "green", recheck: true });
  });

  it("holds a risky command in red until a human answers", () => {
    const a = panelAgent(facts({
      ask: { kind: "run", question: "Run this command?", detail: "git push --force origin main", options: ["Yes", "No"], safeIndex: 1, hint: "h" },
    }));
    expect(a.light).toBe("red");
    expect(a.ask?.risk).toBe("force push rewrites shared history");
  });

  it("shows a harmless question in yellow", () => {
    const a = panelAgent(facts({ ask: { kind: "question", question: "Which one?", options: ["A", "B"], safeIndex: 0, hint: "h" } }));
    expect(a.light).toBe("yellow");
    expect(a.ask?.risk).toBeNull();
  });

  it("keeps the model's sentence beside the rule's", () => {
    expect(panelAgent(facts({ verdict: verdict({ testsPass: false }), plain: "Not finished." })).plain).toBe("Not finished.");
  });

  it("does not raise a stopped agent", () => {
    expect(panelAgent(facts({ status: "stopped" }))).toMatchObject({ light: "green", line: "Ana is stopped." });
  });
});

describe("evidenceRows", () => {
  it("says plainly when nothing changed and no test ran", () => {
    const rows = evidenceRows(verdict({ diffFiles: [], testsPass: null, boardDone: false }));
    expect(rows.map((r) => r.label)).toEqual(["No files changed", "No test run seen", "Board card still open"]);
    expect(rows.every((r) => !r.ok)).toBe(true);
  });

  it("names the failing test", () => {
    const rows = evidenceRows(verdict({ testsPass: false, failDetail: "1 failed" }));
    expect(rows.find((r) => r.label.startsWith("Tests"))).toEqual({ label: "Tests: 1 failed", ok: false });
  });
});

describe("the list", () => {
  const row = (light: PanelAgent["light"]) => ({ light }) as PanelAgent;

  it("puts what needs a human first", () => {
    expect(orderAgents([row("green"), row("yellow"), row("red")]).map((a) => a.light)).toEqual(["red", "yellow", "green"]);
  });

  it("counts who needs you", () => {
    expect(headline([])).toBe("No agents running.");
    expect(headline([row("green")])).toBe("Your agent is fine.");
    expect(headline([row("green"), row("green")])).toBe("All 2 agents are fine.");
    expect(headline([row("red"), row("green")])).toBe("1 agent needs you.");
    expect(headline([row("red"), row("yellow")])).toBe("2 agents need you.");
  });
});

describe("actionMessage", () => {
  const ask = { question: "q", detail: null, options: ["Yes", "No"], safeIndex: 1, hint: "h", risk: null };
  const asking = (a: typeof ask) => ({ ask: a }) as PanelAgent;

  it("types the rescue line", () => {
    expect(actionMessage({ kind: "rescue", agent: "Ana", rescue: "nudge" }, undefined)).toContain("Still there?");
  });

  it("answers y/n prompts with a letter and lists with a number", () => {
    expect(actionMessage({ kind: "answer", agent: "Ana", option: 1 }, asking(ask))).toBe("n");
    expect(actionMessage({ kind: "answer", agent: "Ana", option: 1 }, asking({ ...ask, options: ["Allow once", "Deny"] }))).toBe("2");
  });

  it("refuses an option that is not on screen", () => {
    expect(actionMessage({ kind: "answer", agent: "Ana", option: 5 }, asking(ask))).toBeNull();
    expect(actionMessage({ kind: "answer", agent: "Ana", option: 0 }, undefined)).toBeNull();
  });

  it("types nothing for a recheck", () => {
    expect(actionMessage({ kind: "recheck", agent: "Ana" }, undefined)).toBeNull();
  });

  it("sends a failed agent back with the reason", () => {
    const failed = { sendBack: true, line: "Not done: stub or TODO left in the changed code." } as PanelAgent;
    expect(actionMessage({ kind: "sendback", agent: "Ana" }, failed)).toBe("Not accepted. Not done: stub or TODO left in the changed code. Fix it, run the tests, then report.");
    expect(actionMessage({ kind: "sendback", agent: "Ana" }, { sendBack: false } as PanelAgent)).toBeNull();
  });
});

describe("keptVerdict", () => {
  it("keeps the verdict while the screen is the same", () => {
    expect(keptVerdict({ tailHash: "a", checked: "red" }, "a")).toBe("red");
  });

  it("drops it when the agent shows something new", () => {
    expect(keptVerdict({ tailHash: "a", checked: "red" }, "b")).toBeNull();
    expect(keptVerdict(undefined, "a")).toBeNull();
  });
});
