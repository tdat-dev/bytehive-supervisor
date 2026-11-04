// Rescue send path: one JSON line appended to <workspace>/.bytehive/outbox.jsonl.
// ByteHive drains the file and types the message into the target agent's
// terminal with Enter. Supervisor only writes; delivery stays ByteHive's job.
//
// Keep rescue messages SHORT (one burst): a TUI still assembling a long burst
// reads the trailing Enter as a newline and the message sits unsent. Long
// bodies go to a file; the message carries a pointer to it.

import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { stateDir } from "./paths.js";

export interface OutboxMessage {
  from: string | null;
  to: string | null;
  message: string;
  now: number;
}

/** One outbox.jsonl line for a message. Pure. */
export function buildOutboxLine(msg: OutboxMessage): string {
  return JSON.stringify({ from: msg.from, to: msg.to, message: msg.message, now: msg.now }) + "\n";
}

/** Max characters typed straight into a terminal. Longer bodies go via file. */
export const MAX_DIRECT_CHARS = 120;

export type RescueBody = { kind: "direct"; text: string } | { kind: "file"; pointer: string };

/** Direct text when it fits one burst, else a pointer to the body file. Pure. */
export function rescueBody(text: string, fileRelPath: string): RescueBody {
  if (text.length <= MAX_DIRECT_CHARS) return { kind: "direct", text };
  return {
    kind: "file",
    pointer: `Read ${fileRelPath} and follow it. (${text.length} chars moved to file so this delivers in one burst.)`,
  };
}

/** Append one line to the workspace's outbox.jsonl, creating dirs as needed. */
export async function appendOutboxLine(dir: string, line: string): Promise<void> {
  const state = stateDir(dir);
  await mkdir(state, { recursive: true });
  await appendFile(join(state, "outbox.jsonl"), line, "utf8");
}
