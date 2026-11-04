// Agent-written progress summaries: each agent keeps one small file updated
// in its own worktree; the watch loop reads it and prints on change.
// No model, no key, no install. Convention: docs/AGENT-SUMMARY.md.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stateDir } from "./paths.js";

export const SUMMARY_MAX_CHARS = 500;

/** Pane name → filename slug: lowercase, runs of non-alphanumerics become "-". */
export function slugPane(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "agent";
}

/** Absolute path of the agent's summary file inside its project dir. */
export function summaryPath(projectDir: string, paneName: string): string {
  return join(stateDir(projectDir), `summary-${slugPane(paneName)}.md`);
}

/** Read and normalize the agent's summary, or null when missing/blank.
 *  Newlines collapse to spaces, over-long text truncates with an ellipsis. */
export function readAgentSummary(
  projectDir: string,
  paneName: string,
  readFile: (path: string) => string = (p) => readFileSync(p, "utf8"),
): string | null {
  let raw: string;
  try {
    raw = readFile(summaryPath(projectDir, paneName));
  } catch {
    return null;
  }
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (!oneLine) return null;
  return oneLine.length > SUMMARY_MAX_CHARS
    ? `${oneLine.slice(0, SUMMARY_MAX_CHARS - 1).trimEnd()}…`
    : oneLine;
}
