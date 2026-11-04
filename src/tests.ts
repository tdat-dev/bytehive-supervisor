// Test results from the screen tail: the agent runs its own tests; the
// supervisor reads the verdict off the screen instead of running anything
// itself (no side effects, no waiting on someone else's test suite). Pure.
//
// Only the LAST summary line and what follows it count: an old failure above
// a newer passing run must not flip the verdict. Null when no summary is
// visible at all.

export interface TailTests {
  pass: boolean | null;
  detail?: string;
}

/** Lines that can end a test run, across the common runners. */
const SUMMARY_LINE =
  /(\d+)\s+(failed|failing|passed|passing)\b|test result:|^(FAIL|FAILED|ok)\s|BUILD SUCCESSFUL|all tests passed/i;

const AHEAD = 2;

function lastSummaryWindow(tail: string): string | null {
  const lines = tail.split("\n");
  let at = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (SUMMARY_LINE.test(lines[i])) { at = i; break; }
  }
  if (at < 0) return null;
  // This line and what follows only: anything above may be an older run.
  return lines.slice(at, at + 1 + AHEAD).join("\n");
}

/** "2 passed, 1 failed" fails: any nonzero failure count wins over passes. */
function failureIn(text: string): string | null {
  const count = (re: RegExp, word: string): string | null => {
    const m = text.match(re);
    if (m && Number(m[1]) > 0) return `${m[1]} ${word}`;
    return null;
  };
  return (
    count(/(\d+)\s+failed\b(?!\s+to\b)/i, "failed") ??
    count(/(\d+)\s+failing/i, "failing") ??
    (/\bFAILED\b/.test(text) && /^FAILED\s+(\S+)/m.test(text)
      ? `FAILED ${/^FAILED\s+(\S+)/m.exec(text)?.[1] ?? ""}`.trim()
      : null) ??
    (/test result:\s*FAILED/i.test(text) ? "cargo tests failed" : null) ??
    (/^FAIL[ \t]/m.test(text) ? "go tests failed" : null)
  );
}

/** "0 passed" means no test ran, and that proves nothing. */
const some = (re: RegExp, text: string): boolean => Number(re.exec(text)?.[1] ?? 0) > 0;

function passingIn(text: string): boolean {
  return (
    some(/Test Files\s+(\d+)\s+passed/i, text) ||
    some(/(\d+)\s+passed/i, text) ||
    some(/(\d+)\s+passing/i, text) ||
    /test result:\s*ok/i.test(text) ||
    /^ok\s+\S+/m.test(text) ||
    /BUILD SUCCESSFUL/i.test(text) ||
    /all tests passed/i.test(text)
  );
}

/** Verdict from a screen tail, or null when the tail shows no test run. */
export function testsFromTail(tail: string): TailTests {
  const window = lastSummaryWindow(tail);
  if (!window) return { pass: null };
  const failed = failureIn(window);
  if (failed) return { pass: false, detail: failed };
  if (passingIn(window)) return { pass: true };
  return { pass: null };
}
