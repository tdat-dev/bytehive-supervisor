# ByteHive Supervisor

Supervisor watches a fleet of AI coding agents and answers for the human in
charge: who is stuck, who is really done, and what needs a click. One light and
one plain sentence per agent, with the evidence under it and only the buttons
that can help.

> **What is new.** Everything in this repository was written during the Meta
> hackathon, 26 October to 4 November 2026. It plugs into
> [ByteHive](https://github.com/tdat-dev/maestro-releases), the desktop app
> that runs the agents. ByteHive existed before the hackathon and is not part
> of this entry; Supervisor touches none of its code.

## What it does today

| | Status |
|---|---|
| **Fake-done verdict.** Never trusts "done": a claim is checked against the diff, a TODO or stub scan, the tests on the agent's screen and the board card. Red with the reason, plus Send back and Recheck. (`verdict.ts`, `evidence.ts`, `tests.ts`) | Works |
| **Stuck radar.** Red when an agent repeats the same screen or goes silent, with one rescue button. (`stuck.ts`, `traffic.ts`, `rescuepick.ts`) | Works |
| **Plain questions.** Reads what an agent is asking off its screen and marks the safe answer. (`asking.ts`) | Works |
| **Risk gate.** `git push --force`, `rm -rf`, hard reset and friends are held in red until a person answers. It reads the CLI's own permission prompt, so an agent started with permission prompts off is not gated. (`gate.ts`) | Works |
| **Plain words from a Meta model.** Muse, Meta's coding agent, rewrites red verdicts and risky questions in one sentence through `muse exec`. It uses your own Muse login, no key. (`muse.ts`) | Works, about 30 seconds per sentence |
| **Conflict alarms.** Two agents on one file, across worktrees of a repo, with a button that tells the second to stop. (`fileconflicts.ts`) Two agents on one card shows in the console only. (`cardconflicts.ts`) | Works |
| **Dollars per agent.** `Ana spent ~$3 of ~$20`, with a budget alert. (`cost.ts`) | Tested module, not wired to real usage yet |
| **Back to last working.** A checkpoint and a Restore button. | Not built |

## How it plugs into ByteHive

Supervisor is a separate process. It reads what ByteHive already exposes and
writes to one place:

- `GET /api/fleet` on the local dashboard server (`http://127.0.0.1:8477`, turn
  it on in Settings, Remote): every agent's status plus a tail of its screen.
- `.bytehive/board.json` in each workspace: the kanban board, read only.
- `.bytehive/outbox.jsonl` in each workspace: one line per button press. ByteHive
  types that line into exactly that agent. Nothing is written unless a person
  presses a button.

Folders still on the old `.maestro` name are read too.

## Quickstart

Windows 10 or 11, Node 20 or newer, and [ByteHive](https://github.com/tdat-dev/maestro-releases/releases/latest)
with Settings, Remote turned on. For Muse's sentences, install Muse and log in;
without it the panel keeps the rule-based sentence.

```powershell
npm install
npm run build
npm start -- --dir D:\my-project
# then open http://127.0.0.1:8599
```

Options: `--fleet URL`, `--dir <workspace>` (repeatable), `--interval <seconds>`,
`--stuck-after <seconds>`, `--needs-after <seconds>`, `--panel-port <n>`,
`--no-panel`, `--no-muse`, `--password <dashboard password>`, `--cookie <session>`.

```powershell
npm test
```

## The demo

`demo/setup.mjs` builds three small real git repos with real tests and a board.
`demo/agent.mjs` is a scripted agent, so the run can be repeated: it edits real
files, runs the real tests and reads what you send it, but no model drives it.
Run it as a custom agent in ByteHive, one per workspace:

```powershell
node demo/setup.mjs D:\supervisor-demo
node D:\path\to\demo\agent.mjs fake-done   # in invoice-api
node D:\path\to\demo\agent.mjs loop        # in upload-service
node D:\path\to\demo\agent.mjs risky       # in release-tools
node D:\path\to\demo\agent.mjs question    # in docs-site
node D:\path\to\demo\agent.mjs conflict-keep   # in checkout-web
node D:\path\to\demo\agent.mjs conflict-yield  # in checkout-web-gia, a worktree of it
```

The recorded demo shortens the stuck and waiting thresholds with `--stuck-after`
and `--needs-after`.

## Layout

```
src/
  index.ts      watch loop: poll, check, print, serve the panel
  panel.ts      local page and its actions, 127.0.0.1 only
  panelpage.ts  the page itself
  panelstate.ts one light, one sentence, the right buttons (pure, tested)
  fleet.ts      read /api/fleet
  board.ts      read the board
  evidence.ts   git diff, stub scan, board Done
  tests.ts      test results off the screen tail
  verdict.ts    fake-done verdict (pure, tested)
  stuck.ts      stuck, waiting and loop detector (pure, tested)
  asking.ts     what an agent is asking, and the safe answer
  gate.ts       risky-command matcher (pure, tested)
  rescue.ts     short lines that unstick an agent
  outbox.ts     the only write path
  muse.ts       plain words through `muse exec`
  paths.ts      .bytehive, or .maestro for an old folder
demo/           the repeatable demo
docs/           the pain map behind these features
```

## License

[MIT](LICENSE)
