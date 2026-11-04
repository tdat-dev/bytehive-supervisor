// `watch` CLI: poll ByteHive's /api/fleet, check every agent against the
// evidence, print, and serve the panel. Supervisor writes to one place only:
// the workspace outbox, and only when a human presses a panel button.
//
//   node dist/index.js --dir D:\my-project [--fleet URL] [--interval S]
//     [--cookie ...] [--password ...] [--stuck-after S] [--needs-after S]
//     [--panel-port N] [--no-panel] [--no-muse]

import { FLEET_DEFAULT_URL, fetchFleet, loginFleet, type FleetSnapshot } from "./fleet.js";
import { cardsOf, readBoardFile, type BoardFile } from "./board.js";
import {
  DEFAULT_DETECTOR_OPTIONS,
  detectStuck,
  tailHash,
  updateTracker,
  type AgentSample,
  type DetectorOptions,
  type StuckAlert,
  type TrackerState,
} from "./stuck.js";
import { suggestHandover } from "./handover.js";
import { collectDiffFiles, collectEvidence, type StubHit } from "./evidence.js";
import { findFileConflicts } from "./fileconflicts.js";
import { collectRepoKeys } from "./repoid.js";
import { suggestPartition } from "./suggest.js";
import { findCardConflicts } from "./cardconflicts.js";
import { verdictDone, type DoneEvidence, type DoneVerdict } from "./verdict.js";
import { formatVerdictLine } from "./report.js";
import { classifySummary } from "./summarystatus.js";
import { pickRescue } from "./rescuepick.js";
import { askPrint } from "./askline.js";
import { readAsk } from "./asking.js";
import { classifyCommand } from "./gate.js";
import { appendOutboxLine, buildOutboxLine } from "./outbox.js";
import { PANEL_PORT, startPanel, type PanelSnapshot } from "./panel.js";
import { actionMessage, headline, orderAgents, panelAgent, panelConflict, type PanelAction, type PanelAgent, type PanelConflict } from "./panelstate.js";
import { PlainWords, askPrompt, runMuse, verdictPrompt } from "./muse.js";
import { keptVerdict } from "./panelstate.js";

interface Args {
  fleet: string;
  dirs: string[];
  intervalMs: number;
  cookie?: string;
  password?: string;
  detector: DetectorOptions;
  panelPort: number | null;
  muse: boolean;
}

const USAGE = `Usage: node dist/index.js --dir <workspace>... [--fleet URL] [--interval S]
  [--cookie ...] [--password ...] [--stuck-after S] [--needs-after S]
  [--panel-port N] [--no-panel] [--no-muse]`;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    fleet: FLEET_DEFAULT_URL,
    dirs: [],
    intervalMs: 5000,
    detector: { ...DEFAULT_DETECTOR_OPTIONS },
    panelPort: PANEL_PORT,
    muse: true,
  };
  const seconds = (v: string | undefined, fallback: number) => (Number(v) > 0 ? Number(v) * 1000 : fallback);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fleet") args.fleet = argv[++i] ?? args.fleet;
    else if (a === "--dir") {
      const d = argv[++i];
      if (d) args.dirs.push(d);
    } else if (a === "--interval") args.intervalMs = Math.max(1, Number(argv[++i]) || 5) * 1000;
    else if (a === "--cookie") args.cookie = argv[++i];
    else if (a === "--password") args.password = argv[++i];
    else if (a === "--stuck-after") args.detector.noOutputMs = seconds(argv[++i], args.detector.noOutputMs);
    else if (a === "--needs-after") args.detector.needsMs = seconds(argv[++i], args.detector.needsMs);
    else if (a === "--panel-port") args.panelPort = Number(argv[++i]) || PANEL_PORT;
    else if (a === "--no-panel") args.panelPort = null;
    else if (a === "--no-muse") args.muse = false;
    else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
  }
  return args;
}

interface Checked {
  result: DoneVerdict;
  evidence: DoneEvidence;
  stubs: StubHit[];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let cookie = args.cookie ?? process.env.BYTEHIVE_DASH_COOKIE ?? process.env.MAESTRO_DASH_COOKIE;
  const password = args.password ?? process.env.BYTEHIVE_DASH_PASSWORD;
  let tracker: TrackerState = {};
  // Agent-written summaries: missing/stale/fresh per agent, printed on change.
  const lastSummaryState = new Map<string, string>();
  // Waiting questions, printed once per episode (cleared when resolved).
  const lastAskState = new Map<string, string>();
  const lastChecked = new Map<string, { tailHash: string; checked: Checked }>();

  const words = new PlainWords(args.muse ? runMuse : null);
  let agents: PanelAgent[] = [];
  let conflicts: PanelConflict[] = [];
  let latest: FleetSnapshot = { agents: [], output: {} };
  const sent: PanelSnapshot["sent"] = [];
  let fleetOk = false;
  let fleetNote = "Connecting to ByteHive";
  let checkedAt = 0;
  let wake = () => {};

  const act = async (action: PanelAction): Promise<{ ok: boolean; error?: string }> => {
    if (action.kind === "recheck") {
      wake();
      return { ok: true };
    }
    const target = latest.agents.find((a) => a.name === action.agent);
    if (!target?.projectDir) return { ok: false, error: `${action.agent} is not in the fleet` };
    const message = action.kind === "sync"
      ? conflicts.find((c) => c.agent === action.agent)?.message ?? null
      : actionMessage(action, agents.find((a) => a.name === action.agent));
    if (!message) return { ok: false, error: "nothing to send" };
    const now = Date.now();
    await appendOutboxLine(target.projectDir, buildOutboxLine({ from: "Supervisor", to: target.name, message, now }));
    sent.unshift({ at: now, to: target.name, message });
    sent.length = Math.min(sent.length, 12);
    console.log(`  > SENT ${target.name}: ${message}`);
    return { ok: true };
  };

  if (args.panelPort !== null) {
    startPanel({
      snapshot: () => ({ headline: headline(agents), agents, conflicts, sent, fleetOk, fleetNote, checkedAt }),
      act,
    }, args.panelPort);
    console.log(`Panel: http://127.0.0.1:${args.panelPort}`);
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      if (!cookie && password) cookie = await loginFleet(args.fleet, password);
      const snap = await fetchFleet(args.fleet, cookie ? { cookie } : {});
      latest = snap;
      fleetOk = true;
      fleetNote = `Watching ${snap.agents.length} agent${snap.agents.length === 1 ? "" : "s"} in ByteHive`;
      const now = Date.now();
      const samples: AgentSample[] = snap.agents.map((a) => ({
        id: a.id,
        name: a.name,
        projectDir: a.projectDir,
        status: a.status,
        finished: a.finished,
        tailHash: tailHash(snap.output[a.id] ?? ""),
        at: now,
      }));
      tracker = updateTracker(tracker, samples);
      const boards = new Map<string, BoardFile>();
      for (const dir of new Set([...args.dirs, ...samples.map((s) => s.projectDir).filter(Boolean)])) {
        try {
          const b = await readBoardFile(dir);
          if (b) boards.set(dir, b);
        } catch {
          /* a corrupt board is ByteHive's news, not ours */
        }
      }
      for (const c of findCardConflicts(
        samples.map((s) => ({
          name: s.name,
          projectDir: s.projectDir,
          cards: cardsOf(boards.get(s.projectDir) ?? { version: 0, lists: [] }, s.name),
        })),
      )) {
        console.log(`  ${c.line}`);
        console.log(`  ${suggestPartition({ agents: c.agents, target: c.card, kind: "card" })}`);
      }
      const time = new Date(now).toLocaleTimeString();
      console.log(`--- ${time}: ${samples.length} agent(s) ---`);
      for (const s of samples) {
        const cards = cardsOf(boards.get(s.projectDir) ?? { version: 0, lists: [] }, s.name);
        console.log(`  ${s.name} [${s.status}]${s.finished ? ` (${s.finished})` : ""}${cards.length ? `: ${cards[0]}` : ""}`);
      }
      // Same-file alarm: one diff listing per project dir per poll.
      // Repo keys (not raw dirs) so two worktrees of one repo still match.
      const repoKeys = await collectRepoKeys([...new Set(samples.map((s) => s.projectDir).filter(Boolean))]);
      const diffFilesByDir = new Map<string, string[]>();
      for (const dir of new Set(samples.map((s) => s.projectDir).filter(Boolean))) {
        const { files } = await collectDiffFiles(dir);
        diffFilesByDir.set(dir, files);
      }
      const nextConflicts: PanelConflict[] = [];
      for (const c of findFileConflicts(
        samples.map((s) => ({
          name: s.name,
          projectDir: repoKeys.get(s.projectDir) ?? s.projectDir,
          diffFiles: diffFilesByDir.get(s.projectDir) ?? [],
        })),
      )) {
        console.log(`  ${c.line}`);
        const suggestion = suggestPartition({ agents: c.agents, target: c.file, kind: "file" });
        console.log(`  ${suggestion}`);
        nextConflicts.push(panelConflict(c, suggestion));
      }
      conflicts = nextConflicts;
      const checked = new Map<string, Checked>();
      for (const s of samples) {
        if (!s.finished || !s.projectDir) continue;
        const board = boards.get(s.projectDir) ?? { version: 0, lists: [] };
        const { evidence, stubHits, warnings } = await collectEvidence({
          dir: s.projectDir,
          board,
          agentName: s.name,
          tail: snap.output[s.id],
        });
        const result = verdictDone(evidence);
        checked.set(s.id, { result, evidence, stubs: stubHits });
        console.log("  " + formatVerdictLine(s.name, s.finished, result));
        for (const w of warnings) console.log(`    (evidence warn: ${w})`);
      }
      // Opening an agent in ByteHive repaints its terminal, and for a moment the
      // app calls it working again. Same screen, same work: the verdict stands.
      for (const s of samples) {
        const now_ = checked.get(s.id);
        if (now_) lastChecked.set(s.id, { tailHash: s.tailHash, checked: now_ });
        else {
          const kept = keptVerdict(lastChecked.get(s.id), s.tailHash);
          if (kept) checked.set(s.id, kept);
          else lastChecked.delete(s.id);
        }
      }
      const alerts = detectStuck(tracker, now, args.detector).filter((a) => !checked.has(a.agentId));
      const waitingIds = new Set(alerts.filter((a) => a.kind === "waiting").map((a) => a.agentId));
      for (const id of [...lastAskState.keys()]) if (!waitingIds.has(id)) lastAskState.delete(id);
      for (const alert of alerts) {
        console.log(`  ! STUCK [${alert.kind}] ${alert.detail}`);
        const to = suggestHandover(
          alert.name,
          alert.projectDir,
          samples.map((s) => ({ name: s.name, projectDir: s.projectDir, status: s.status })),
        );
        console.log(to ? `    → hand over to ${to.to}? (${to.reason}; needs your click)` : "    → nobody idle to hand over to");
        const rescue = pickRescue(alert.kind);
        if (rescue) console.log(`    ↻ rescue (${rescue.kind}): ${rescue.line}`);
        if (alert.kind === "waiting") {
          const ap = askPrint(alert.name, snap.output[alert.agentId] ?? "");
          const key = ap ? `ask:${ap.key}` : "ask:none";
          if (key !== lastAskState.get(alert.agentId)) {
            lastAskState.set(alert.agentId, key);
            if (ap) for (const line of ap.lines) console.log(line);
          }
        }
      }
      // Agent-written summaries last: cheap file reads, printed on change.
      for (const s of samples) {
        if (s.status === "stopped") continue;
        const st = classifySummary(s.projectDir, s.name, now);
        const key = st.kind === "missing" ? "missing" : `${st.kind}:${st.text}`;
        if (key === lastSummaryState.get(s.id)) continue;
        lastSummaryState.set(s.id, key);
        if (st.kind === "fresh") console.log(`  ~ SUMMARY ${s.name}: ${st.text}`);
        else if (st.kind === "stale") console.log(`  ! STALE-REPORT ${s.name}: last report ${Math.round(st.ageMs / 60000)}m ago: ${st.text}`);
      }
      agents = orderAgents(snap.agents.map((a) => {
        const tail = snap.output[a.id] ?? "";
        const waiting = a.status === "needs" || a.status === "idle";
        const ask = waiting && a.status !== "stopped" ? readAsk(tail) : null;
        const verdict = ask ? null : checked.get(a.id) ?? null;
        const alert: StuckAlert | null = alerts.find((x) => x.agentId === a.id) ?? null;
        let plain: string | null = null;
        if (ask) {
          const risk = classifyCommand(ask.detail ?? ask.question);
          plain = words.get(`ask:${a.name}:${ask.question}:${ask.detail ?? ""}`, () =>
            askPrompt({ name: a.name, question: ask.question, detail: ask.detail, risk: risk.reason }));
        } else if (verdict && !verdict.result.ok) {
          const stub = verdict.stubs[0];
          const facts = {
            name: a.name,
            reason: verdict.result.reason,
            files: verdict.evidence.diffFiles,
            stub: stub ? `${stub.file}:${stub.line} ${stub.text}` : undefined,
            testDetail: verdict.evidence.failDetail,
          };
          plain = words.get(`verdict:${a.name}:${verdict.result.reason}:${facts.stub ?? ""}`, () => verdictPrompt(facts));
        }
        return panelAgent({ id: a.id, name: a.name, project: a.project, status: a.status, alert, verdict, ask, plain });
      }));
      checkedAt = now;
    } catch (e) {
      fleetOk = false;
      fleetNote = "Can't reach ByteHive. Turn on Settings, Remote.";
      console.log(`--- fleet unreachable (${(e as Error).message}). Is ByteHive running with Settings → Remote on? Retrying…`);
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, args.intervalMs);
      wake = () => { clearTimeout(timer); resolve(); };
    });
  }
}

void main();
