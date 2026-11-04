// A scripted coding agent for a repeatable demo. It behaves like the real
// failure modes Supervisor exists for, against real files, real git and real
// tests, but no model drives it. Run inside a demo workspace:
//   node agent.mjs fake-done | loop | risky

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

const scenario = process.argv[2];
const say = (line = "") => console.log(line);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clear = () => process.stdout.write("\x1b[2J\x1b[H");

let onLine = () => {};
createInterface({ input: process.stdin }).on("line", (l) => onLine(l.trim()));
const nextLine = () => new Promise((r) => { onLine = r; });

function runTests() {
  const r = spawnSync(process.execPath, ["--test"], { encoding: "utf8" });
  const count = (word) => Number(new RegExp(`^\\S+ ${word} (\\d+)`, "m").exec(r.stdout)?.[1] ?? 0);
  return { passed: count("pass"), failed: count("fail") };
}

function moveCardToDone() {
  const file = join(".bytehive", "board.json");
  if (!existsSync(file)) return;
  const board = JSON.parse(readFileSync(file, "utf8"));
  const [doing, done] = board.lists;
  done.cards.push(...doing.cards.splice(0));
  writeFileSync(file, JSON.stringify(board, null, 2));
}

async function fakeDone() {
  say("Task: add tax to invoice totals");
  await sleep(1500);
  say("Reading src/invoice.js");
  await sleep(1500);
  say("Editing src/invoice.js");
  writeFileSync("src/invoice.js", `export function total(lines, taxRate = 0.1) {
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  // TODO: real tax rules, flat rate for now
  return subtotal;
}
`);
  writeFileSync("test/tax.test.js", `import test from "node:test";
import assert from "node:assert/strict";
import { total } from "../src/invoice.js";

test("adds tax", () => {
  assert.equal(total([{ price: 100, qty: 1 }], 0.1), 110);
});
`);
  await sleep(1500);
  say("Running npm test");
  const t = runTests();
  say(`${t.passed} passed, ${t.failed} failed`);
  await sleep(800);
  say("");
  say("All done! Invoices now include tax and everything works.");

  await nextLine();
  clear();
  say("Got it. Fixing src/invoice.js");
  writeFileSync("src/invoice.js", `export function total(lines, taxRate = 0) {
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  return subtotal * (1 + taxRate);
}
`);
  await sleep(2000);
  say("Running npm test");
  const fixed = runTests();
  say(`${fixed.passed} passed, ${fixed.failed} failed`);
  moveCardToDone();
  await sleep(800);
  say("Moved the card to Done.");
  await nextLine();
}

async function loop() {
  say("Task: retry failed uploads");
  await sleep(1200);
  say("Reading src/upload.js");
  await sleep(1200);
  say("The upload test keeps timing out. Trying again.");
  let stop = false;
  const answered = nextLine().then((l) => { stop = true; return l; });
  const frames = "|/-\\";
  for (let i = 0; !stop; i++) {
    process.stdout.write(`\rRetrying the same upload step ${frames[0]}`);
    await sleep(700);
    if (i < 0) process.stdout.write(frames[i]);
  }
  await answered;
  clear();
  say("Tried: the same upload 40 times.");
  say("Failed: the test server URL in .env is wrong.");
  say("Need: the right URL, or a stub server for the test.");
  await sleep(1500);
  say("");
  say("Stopped looping. Waiting for you.");
  await nextLine();
}

async function risky() {
  say("Task: ship the release branch");
  await sleep(4000);
  say("The remote has commits I don't have.");
  await sleep(2000);
  clear();
  say("Bash command");
  say("");
  say("git push --force origin main");
  say("Do you want to proceed?");
  say("❯ 1. Yes");
  say("  2. No");
  say("");
  say("Esc to cancel");
  const answer = await nextLine();
  clear();
  if (answer === "1" || answer === "y") say("Force pushing.");
  else {
    say("OK, nothing was pushed.");
    say("Opening a pull request instead.");
  }
  await nextLine();
}

const run = { "fake-done": fakeDone, loop, risky }[scenario];
if (!run) {
  say("Usage: node agent.mjs fake-done | loop | risky");
  process.exit(1);
}
await run();
