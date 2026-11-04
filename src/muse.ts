// Plain words from a Meta model: Muse, Meta's coding agent CLI, run headless
// with `muse exec`. It uses the owner's own Muse login, so there is no key to
// keep. A call takes about half a minute, so nothing ever waits on it: the
// rule-based sentence shows first and the model's sentence replaces it when it
// lands. Any failure just leaves the rule-based sentence in place.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const MUSE_TIMEOUT_MS = 120_000;
const MAX_REPLY_CHARS = 220;

export interface VerdictFacts {
  name: string;
  reason: string;
  files: string[];
  stub?: string;
  testDetail?: string;
}

/** The prompt for one red verdict. Pure. */
export function verdictPrompt(f: VerdictFacts): string {
  return [
    "You write one sentence for the owner of a software project, who may not read code.",
    `An AI coding agent named ${f.name} said it finished, but a check found: ${f.reason}`,
    f.files.length ? `Files it changed: ${f.files.slice(0, 5).join(", ")}.` : "It changed no files.",
    f.stub ? `Unfinished code found: ${f.stub}` : "",
    f.testDetail ? `Test result: ${f.testDetail}` : "",
    "Say what is really true and what it means for them. One sentence, under 25 words, no jargon, no quotes, no tools.",
  ].filter(Boolean).join("\n");
}

export interface AskFacts {
  name: string;
  question: string;
  detail?: string;
  risk?: string | null;
}

/** The prompt for one agent question. Pure. */
export function askPrompt(f: AskFacts): string {
  return [
    "You write one sentence for the owner of a software project, who may not read code.",
    `An AI coding agent named ${f.name} is asking: ${f.question}`,
    f.detail ? `It wants to run or touch: ${f.detail}` : "",
    f.risk ? `A safety check flagged this: ${f.risk}.` : "",
    "Say what would happen if they say yes. One sentence, under 25 words, no jargon, no quotes, no tools.",
  ].filter(Boolean).join("\n");
}

/** The sentence in a `muse exec` reply: its last line with words on it. Pure. */
export function parseMuseReply(stdout: string): string | null {
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^muse:/i.test(l));
  const last = lines.at(-1)?.replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!last) return null;
  return last.length > MAX_REPLY_CHARS ? `${last.slice(0, MAX_REPLY_CHARS - 1).trimEnd()}…` : last;
}

export type MuseRun = (prompt: string) => Promise<string | null>;

/** One headless Muse call. The prompt goes through a file: no shell quoting. */
export const runMuse: MuseRun = (prompt) =>
  new Promise((resolve) => {
    const work = mkdtempSync(join(tmpdir(), "supervisor-muse-"));
    const file = join(work, "prompt.txt");
    writeFileSync(file, prompt, "utf8");
    const done = (text: string | null) => {
      rmSync(work, { recursive: true, force: true });
      resolve(text);
    };
    const cmd = process.platform === "win32" ? "cmd.exe" : "muse";
    const args = ["exec", "--prompt-file", file, "--workspace", work];
    const child = spawn(cmd, process.platform === "win32" ? ["/c", "muse", ...args] : args, {
      cwd: work,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
    const timer = setTimeout(() => child.kill(), MUSE_TIMEOUT_MS);
    child.on("error", () => { clearTimeout(timer); done(null); });
    child.on("close", (code) => { clearTimeout(timer); done(code === 0 ? parseMuseReply(out) : null); });
  });

/** Model sentences by key: asked once, one at a time, read without waiting. */
export class PlainWords {
  private readonly known = new Map<string, string | null>();
  private readonly queue: Array<{ key: string; prompt: string }> = [];
  private busy = false;

  constructor(private readonly run: MuseRun | null) {}

  /** The sentence for a key, or null while it is unknown or still being written. */
  get(key: string, prompt: () => string): string | null {
    if (!this.run) return null;
    if (this.known.has(key)) return this.known.get(key) ?? null;
    this.known.set(key, null);
    this.queue.push({ key, prompt: prompt() });
    void this.drain();
    return null;
  }

  private async drain(): Promise<void> {
    if (this.busy || !this.run) return;
    this.busy = true;
    for (let job = this.queue.shift(); job; job = this.queue.shift()) {
      this.known.set(job.key, await this.run(job.prompt).catch(() => null));
    }
    this.busy = false;
  }
}
