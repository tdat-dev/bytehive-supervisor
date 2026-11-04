// What the panel shows for one agent: one light, one plain sentence, the
// evidence under it, and only the buttons that can help. Pure.

import type { PlainAsk } from "./asking.js";
import type { StubHit } from "./evidence.js";
import { classifyCommand } from "./gate.js";
import { pickRescue } from "./rescuepick.js";
import { rescueLine, type RescueKind } from "./rescue.js";
import type { StuckAlert } from "./stuck.js";
import { alertToLight, type Light } from "./traffic.js";
import type { DoneEvidence, DoneVerdict } from "./verdict.js";

export interface PanelEvidence {
  label: string;
  ok: boolean;
}

export interface PanelAsk {
  question: string;
  detail: string | null;
  options: string[];
  safeIndex: number;
  hint: string;
  /** Why this one must wait for a human, when the command is risky. */
  risk: string | null;
}

export interface PanelAgent {
  id: string;
  name: string;
  project: string;
  light: Light;
  /** The rule-based sentence. Always there, always true. */
  line: string;
  /** The same fact in Muse's words, once it has written them. */
  plain: string | null;
  evidence: PanelEvidence[];
  ask: PanelAsk | null;
  rescue: { kind: RescueKind; label: string } | null;
  recheck: boolean;
  /** Its work failed the check: offer to send it back with the reason. */
  sendBack: boolean;
}

export interface AgentFacts {
  id: string;
  name: string;
  project: string;
  status: string;
  alert: StuckAlert | null;
  verdict: { result: DoneVerdict; evidence: DoneEvidence; stubs: StubHit[] } | null;
  ask: PlainAsk | null;
  plain?: string | null;
}

const RESCUE_LABEL: Record<RescueKind, string> = { nudge: "Nudge", explain: "Ask what failed", "retry-step": "Retry the step" };

/** The checks behind a verdict, as short lines a person can verify. */
export function evidenceRows(v: NonNullable<AgentFacts["verdict"]>): PanelEvidence[] {
  const { evidence: e, stubs } = v;
  const n = e.diffFiles.length;
  const rows: PanelEvidence[] = [{ label: n ? `${n} file${n === 1 ? "" : "s"} changed` : "No files changed", ok: n > 0 }];
  if (stubs.length) rows.push({ label: `${stubs[0].file}:${stubs[0].line}  ${stubs[0].text}`, ok: false });
  else if (n) rows.push({ label: "No TODO or stub left", ok: true });
  if (e.testsPass === false) rows.push({ label: e.failDetail ? `Tests: ${e.failDetail}` : "Tests failing", ok: false });
  else if (e.testsPass === true) rows.push({ label: "Tests pass", ok: true });
  else rows.push({ label: "No test run seen", ok: false });
  rows.push({ label: e.boardDone ? "Board card in Done" : "Board card still open", ok: e.boardDone });
  return rows;
}

function panelAsk(ask: PlainAsk): PanelAsk {
  const risk = classifyCommand(ask.detail ?? ask.question);
  return {
    question: ask.question,
    detail: ask.detail ?? null,
    options: ask.options,
    safeIndex: ask.safeIndex,
    hint: ask.hint,
    risk: risk.risky ? risk.reason : null,
  };
}

/** One agent's row. A red verdict outranks a stuck alert, and a live question
 *  outranks both: it is what the agent is blocked on right now. */
export function panelAgent(f: AgentFacts): PanelAgent {
  const base = { id: f.id, name: f.name, project: f.project, plain: f.plain ?? null };
  if (f.ask) {
    const ask = panelAsk(f.ask);
    return {
      ...base,
      light: ask.risk ? "red" : "yellow",
      line: ask.risk ? `${f.name} wants to do something risky: ${ask.risk}.` : `${f.name} is asking: ${f.ask.question}`,
      evidence: [],
      ask,
      rescue: null,
      recheck: false,
      sendBack: false,
    };
  }
  if (f.verdict) {
    return {
      ...base,
      light: f.verdict.result.level,
      line: f.verdict.result.reason,
      evidence: evidenceRows(f.verdict),
      ask: null,
      rescue: null,
      recheck: true,
      sendBack: !f.verdict.result.ok,
    };
  }
  if (f.status === "stopped") {
    return { ...base, light: "green", line: `${f.name} is stopped.`, plain: null, evidence: [], ask: null, rescue: null, recheck: false, sendBack: false };
  }
  const state = alertToLight(f.alert, f.name);
  const picked = f.alert ? pickRescue(f.alert.kind) : null;
  return {
    ...base,
    light: state.light,
    line: state.line,
    evidence: [],
    ask: null,
    rescue: picked ? { kind: picked.kind, label: RESCUE_LABEL[picked.kind] } : null,
    recheck: false,
    sendBack: false,
  };
}

/** Worst first, so what needs a human is at the top. */
export function orderAgents(agents: PanelAgent[]): PanelAgent[] {
  const rank: Record<Light, number> = { red: 0, yellow: 1, green: 2 };
  return [...agents].sort((a, b) => rank[a.light] - rank[b.light]);
}

/** The headline over the list. */
export function headline(agents: PanelAgent[]): string {
  const need = agents.filter((a) => a.light !== "green").length;
  if (!agents.length) return "No agents running.";
  if (!need) return agents.length === 1 ? "Your agent is fine." : `All ${agents.length} agents are fine.`;
  return need === 1 ? "1 agent needs you." : `${need} agents need you.`;
}

export type PanelAction =
  | { kind: "rescue"; agent: string; rescue: RescueKind }
  | { kind: "answer"; agent: string; option: number }
  | { kind: "sendback"; agent: string }
  | { kind: "sync"; agent: string }
  | { kind: "recheck"; agent: string };

/** The line typed into an agent for an action, or null when nothing is typed.
 *  A numbered prompt takes the option's number, a y/n prompt its letter. */
/** Two agents on one file: who should stop, and the line that tells them. */
export interface PanelConflict {
  line: string;
  suggestion: string;
  /** The agent the button talks to. */
  agent: string;
  message: string;
}

export function panelConflict(c: { agents: [string, string]; file: string; line: string }, suggestion: string): PanelConflict {
  const [first, second] = c.agents;
  return {
    line: c.line.replace(/^!\s*CONFLICT\s*/, ""),
    suggestion: suggestion.replace(/^→\s*/, ""),
    agent: second,
    message: `Stop editing ${c.file}: ${first} is changing it too. Undo your edit there and sync with ${first}.`,
  };
}

export function actionMessage(action: PanelAction, agent: PanelAgent | undefined): string | null {
  if (action.kind === "recheck" || action.kind === "sync") return null;
  if (action.kind === "rescue") return rescueLine(action.rescue);
  if (action.kind === "sendback") return agent?.sendBack ? `Not accepted. ${agent.line} Fix it, run the tests, then report.` : null;
  const ask = agent?.ask;
  if (!ask || action.option < 0 || action.option >= ask.options.length) return null;
  const label = ask.options[action.option];
  if (/^yes$/i.test(label)) return "y";
  if (/^no$/i.test(label)) return "n";
  return String(action.option + 1);
}

/** The last verdict, while the agent's screen has not changed since it. */
export function keptVerdict<T>(last: { tailHash: string; checked: T } | undefined, tailHash: string): T | null {
  return last && last.tailHash === tailHash ? last.checked : null;
}
