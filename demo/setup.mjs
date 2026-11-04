// Builds the demo workspaces: three small real git repos, each with a real
// test suite and a ByteHive board. Run: node demo/setup.mjs [folder]
// The folder is wiped first, so point it at a demo folder only.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "D:/supervisor-demo");
if (!/supervisor-demo/i.test(root)) throw new Error("refusing to wipe a folder not named supervisor-demo");
rmSync(root, { recursive: true, force: true });

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "ignore" });

function repo(name, card, assignee, files) {
  const dir = join(root, name);
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "test"), { recursive: true });
  for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text);
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name, private: true, type: "module", scripts: { test: "node --test" } }, null, 2));
  writeFileSync(join(dir, ".gitignore"), ".bytehive/\n");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Demo");
  git(dir, "config", "user.email", "demo@example.invalid");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "chore: start");
  mkdirSync(join(dir, ".bytehive"), { recursive: true });
  writeFileSync(join(dir, ".bytehive", "board.json"), JSON.stringify({
    version: 2,
    lists: [
      { id: "doing", title: "Doing", cards: [{ id: "c1", title: card, desc: "", assignee }] },
      { id: "done", title: "Done", cards: [] },
    ],
  }, null, 2));
  return dir;
}

repo("invoice-api", "Add tax to invoice totals", "Ana", {
  "src/invoice.js": "export function total(lines) {\n  return lines.reduce((sum, l) => sum + l.price * l.qty, 0);\n}\n",
  "test/invoice.test.js": `import test from "node:test";
import assert from "node:assert/strict";
import { total } from "../src/invoice.js";

test("adds up the lines", () => {
  assert.equal(total([{ price: 10, qty: 2 }]), 20);
});
`,
});
repo("upload-service", "Retry failed uploads", "Bob", {
  "src/upload.js": "export async function upload(send, file) {\n  return send(file);\n}\n",
  "test/upload.test.js": 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { upload } from "../src/upload.js";\n\ntest("sends the file", async () => {\n  assert.equal(await upload(async (f) => f, "a"), "a");\n});\n',
});
repo("release-tools", "Ship the release branch", "Cleo", {
  "src/release.js": 'export const channel = "stable";\n',
  "test/release.test.js": 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { channel } from "../src/release.js";\n\ntest("is stable", () => {\n  assert.equal(channel, "stable");\n});\n',
});
repo("docs-site", "Write the changelog page", "Eve", {
  "src/changelog.js": 'export const dateFormat = "";\n',
  "test/changelog.test.js": 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { dateFormat } from "../src/changelog.js";\n\ntest("is a string", () => {\n  assert.equal(typeof dateFormat, "string");\n});\n',
});
const cart = repo("checkout-web", "Free shipping over $50", "Finn", {
  "src/cart.js": "export function shipping(total) {\n  return 5;\n}\n",
  "test/cart.test.js": 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { shipping } from "../src/cart.js";\n\ntest("charges for small orders", () => {\n  assert.equal(shipping(10), 5);\n});\n',
});
// Gia works on the same repo from a worktree of its own, as ByteHive sets up.
const gia = join(root, "checkout-web-gia");
git(cart, "worktree", "add", "-q", "-b", "gia/discounts", gia);
mkdirSync(join(gia, ".bytehive"), { recursive: true });
writeFileSync(join(gia, ".bytehive", "board.json"), JSON.stringify({
  version: 2,
  lists: [
    { id: "doing", title: "Doing", cards: [{ id: "c1", title: "Cart discount codes", desc: "", assignee: "Gia" }] },
    { id: "done", title: "Done", cards: [] },
  ],
}, null, 2));
repo("pricing-lib", "Add a percent discount", "Hana", {
  "src/price.js": "export function discount(total, percent) {\n  throw new Error(\"to write\");\n}\n",
  "test/price.test.js": 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { discount } from "../src/price.js";\n\ntest("takes the percent off", () => {\n  assert.equal(discount(200, 25), 150);\n});\n',
});
console.log(`Demo workspaces ready in ${root}`);
