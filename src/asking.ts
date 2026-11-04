// Plain-questions skin: read what an agent is asking from its screen tail,
// restate it in plain words, and point at the safe answer. Pure: the tail
// comes from the fleet snapshot, no ByteHive code involved.

export type AskKind = "run" | "edit" | "question";

export interface AskOption {
  label: string;
}

/** One agent question, translated for a non-technical human. */
export interface PlainAsk {
  kind: AskKind;
  /** The question in plain words. */
  question: string;
  /** What the agent wants to touch (command or file), when visible. */
  detail?: string;
  /** Options as shown on screen, without free-text/chat rows. */
  options: string[];
  /** Index of the recommended safe answer, or -1 when there is none. */
  safeIndex: number;
  /** One plain line saying what the safe answer does. */
  hint: string;
}

const MAX_LINES = 40;
// "1. Yes", "❯ 2. No", "› 3. Allow once (y)"
const OPTION = /^[❯›●>▸]?\s*(\d{1,2})\s*[.)]\s*(.+?)\s*$/;
// Only a live prompt draws these; a numbered list in prose has none.
const LIVE_HINT = /enter to (select|confirm)|esc to cancel|to navigate|press enter|\(y\/n\)|\[y\/n\]/i;
const RUN_HINT = /do you want to proceed|allow execution|run (this|the) command|bash command|execute|would you like (me )?to run/i;
const EDIT_HINT = /edit (this|the) file|write to|create (this|the) file|apply (these|the) changes|allow (file )?edits|modify .*file/i;
const FREE_TEXT_ROW = /type (something|here|your answer)|just (chat|ask)|something else/i;
// Least-risky answers first: a refusal beats a one-off, a one-off beats always.
const DENY = /^(no|deny|cancel|never|stop|don't allow|do not allow)\b/i;
const ONCE = /once|just this|only this|one time|this time only/i;
const ALWAYS = /always|don't ask again|do not ask again|never ask/i;

function clean(line: string): string {
  return line.replace(/^[\s│┃|╭╮╰╯─━]+|[\s│┃|╭╮╰╯]+$/g, "").replace(/\s+$/, "");
}

/** Index of the least-risky option, or -1 when every option is risky. */
function pickSafe(kind: AskKind, options: string[]): number {
  const deny = options.findIndex((o) => DENY.test(o) && !ALWAYS.test(o));
  if (deny >= 0) return deny;
  const once = options.findIndex((o) => ONCE.test(o));
  if (once >= 0) return once;
  if (kind === "question") {
    // A plain question runs nothing by itself; any single answer is safe
    // as long as it is not an "always" trap.
    const plain = options.findIndex((o) => !ALWAYS.test(o));
    return plain;
  }
  return -1;
}

function hintFor(kind: AskKind, safeIndex: number): string {
  if (safeIndex < 0) return "No safe answer found: read the options before you pick.";
  if (kind === "run") return "Safe answer runs nothing until you say so.";
  if (kind === "edit") return "Safe answer leaves your files unchanged.";
  return "Safe answer picks one option; nothing runs until you confirm.";
}

/** Read the agent's live question from a screen tail, or null when the
 *  agent is not asking anything. Pure. */
export function readAsk(tail: string): PlainAsk | null {
  const lines = tail.split("\n").map(clean).filter((l) => l.length > 0).slice(-MAX_LINES);
  if (lines.length === 0) return null;
  const block = lines.join("\n");

  const options: string[] = [];
  for (const line of lines) {
    const m = OPTION.exec(line);
    if (m && m[2] && !FREE_TEXT_ROW.test(m[2])) options.push(m[2]);
  }
  const promptLine = [...lines].reverse().find((l) => l.includes("?") && !OPTION.test(l));
  const live = LIVE_HINT.test(block) || Boolean(promptLine) || RUN_HINT.test(block) || EDIT_HINT.test(block);
  // Options without any sign of a live prompt are just a list in prose.
  if (options.length === 0 || !live) {
    // A bare y/n confirmation has no numbered options but is still a question.
    if (!/\(y\/n\)|\[y\/n\]/i.test(block) || !promptLine) return null;
    const kind: AskKind = RUN_HINT.test(block) ? "run" : EDIT_HINT.test(block) ? "edit" : "question";
    const yn = ["Yes", "No"];
    const safeIndex = kind === "question" ? 0 : 1;
    return { kind, question: promptLine, options: yn, safeIndex, hint: hintFor(kind, safeIndex) };
  }

  const kind: AskKind = RUN_HINT.test(block) ? "run" : EDIT_HINT.test(block) ? "edit" : "question";
  const question = promptLine ?? (kind === "run"
    ? "The agent wants to run something. Allow it?"
    : kind === "edit"
      ? "The agent wants to change a file. Allow it?"
      : "The agent is asking you to pick one.");
  // A run prompt shows the command on the line above its question; otherwise
  // the command or file is the odd line sitting with the prompt.
  const above = lines[lines.indexOf(question) - 1];
  const detail = kind === "run" && above && !OPTION.test(above) && !RUN_HINT.test(above)
    ? above
    : lines.find((l) => l !== question && !OPTION.test(l) && /[/$\\]/.test(l) && l.length < 160 && !LIVE_HINT.test(l));
  const safeIndex = pickSafe(kind, options);
  return { kind, question, options, safeIndex, hint: hintFor(kind, safeIndex), ...(detail ? { detail } : {}) };
}
