// The panel's one page: plain HTML, no build step, no dependencies. It reads
// /state every second and repaints only when something changed, so a button
// never moves under the cursor between polls.

export const PANEL_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Supervisor</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #08090b; --panel: #101114; --raise: #17181c; --line: rgba(255, 255, 255, .08);
    --ink: #f4f4f5; --ink-2: #b4b4bc; --ink-3: #8c8c96;
    --red: #f2766b; --yellow: #f0bf6a; --green: #6fd6a0; --honey: #f5a524;
    --sans: 'Geist', 'Segoe UI', system-ui, sans-serif;
    --mono: 'Geist Mono', 'Cascadia Code', Consolas, monospace;
  }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--bg); color: var(--ink); font: 16px/1.5 var(--sans); min-height: 100dvh; }
  .wrap { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 48px; max-width: 1320px; margin: 0 auto; padding: 36px 40px 48px; }
  header { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; color: var(--ink-2); font-weight: 500; }
  header svg { width: 26px; height: 26px; }
  .note { margin-left: auto; font-size: 14px; color: var(--ink-3); }
  .note.bad { color: var(--red); }
  h1 { font-size: 44px; line-height: 1.1; font-weight: 600; letter-spacing: -.025em; margin-bottom: 24px; text-wrap: balance; }
  .comb { display: flex; flex-wrap: wrap; gap: 6px 4px; margin-bottom: 26px; }
  .cell { position: relative; width: 62px; height: 70px; }
  .cell svg { display: block; width: 100%; height: 100%; }
  .cell path { transition: fill .35s ease-out; }
  .cell span { position: absolute; inset: 0; display: grid; place-items: center; font: 600 22px var(--sans); color: #08090b; }
  .cell.red path { fill: var(--red); } .cell.yellow path { fill: var(--yellow); } .cell.green path { fill: var(--green); }
  .clash { padding: 20px 22px; margin-bottom: 8px; border-radius: 14px; background: var(--panel); border: 1px solid rgba(240, 191, 106, .35); }
  .clash .line { font-size: 20px; }
  .clash .hint { color: var(--ink-2); font-size: 15px; }
  .agent { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 20px; padding: 24px 0; border-top: 1px solid var(--line); }
  .light { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; font-size: 13px; font-weight: 500; }
  .dot { width: 22px; height: 22px; border-radius: 50%; background: currentColor; }
  .red { color: var(--red); } .yellow { color: var(--yellow); } .green { color: var(--green); }
  .who { color: var(--ink-3); font-size: 15px; margin-bottom: 4px; }
  .who b { color: var(--ink); font-weight: 600; }
  .line { font-size: 22px; line-height: 1.32; font-weight: 500; letter-spacing: -.01em; max-width: 34em; }
  .plain { margin-top: 10px; color: var(--ink-2); font-size: 17px; max-width: 42em; }
  .plain span { display: block; color: var(--honey); font-size: 13px; font-weight: 500; }
  .proof { list-style: none; padding: 0; margin-top: 14px; font: 14px/1.7 var(--mono); color: var(--ink-2); }
  .proof li { display: flex; gap: 10px; }
  .proof i { font-style: normal; width: 1em; flex: none; }
  .proof .no i { color: var(--red); } .proof .yes i { color: var(--green); }
  .cmd { display: inline-block; margin-top: 12px; padding: 6px 12px; border-radius: 8px; background: var(--raise); font: 14px var(--mono); color: var(--ink); }
  .hint { margin-top: 10px; color: var(--ink-3); font-size: 14px; }
  .acts { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
  button { font: 500 15px var(--sans); min-height: 40px; padding: 0 18px; border-radius: 10px; border: 1px solid var(--line); background: var(--raise); color: var(--ink); cursor: pointer; transition: transform .12s ease-out, background .12s ease-out; }
  button:hover { background: #22232a; }
  button:active { transform: translateY(1px); }
  button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  button.main { background: var(--ink); color: #08090b; border-color: transparent; }
  button.main:hover { background: #fff; }
  button:disabled { opacity: .55; cursor: default; }
  aside h2 { font-size: 15px; font-weight: 500; color: var(--ink-3); margin-bottom: 12px; }
  .sent { list-style: none; padding: 0; }
  .sent li { padding: 12px 0; border-top: 1px solid var(--line); font-size: 15px; }
  .sent b { font-weight: 600; }
  .sent q { display: block; quotes: none; color: var(--ink-2); font: 14px/1.5 var(--mono); margin-top: 2px; overflow-wrap: anywhere; }
  .sent time { color: var(--ink-3); font-size: 13px; float: right; }
  .empty { color: var(--ink-3); font-size: 15px; }
  @media (max-width: 900px) {
    .wrap { grid-template-columns: minmax(0, 1fr); gap: 28px; padding: 20px 16px 32px; }
    h1 { font-size: 32px; }
    .agent { grid-template-columns: minmax(0, 1fr); gap: 10px; }
    .light { flex-direction: row; align-items: center; }
    .line { font-size: 19px; }
  }
  @media (prefers-reduced-motion: reduce) { button { transition: none; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#f5a524" d="M12 .8 21.7 6.4v11.2L12 23.2 2.3 17.6V6.4Z"/><path fill="none" stroke="#08090b" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" d="M8 8.8l3.4 3.4L8 15.6M13.6 15.6h3.9"/></svg>
    <span>ByteHive Supervisor</span>
    <span class="note" id="note" role="status"></span>
  </header>
  <main>
    <h1 id="head">Reading your agents</h1>
    <div class="comb" id="comb" aria-hidden="true"></div>
    <div id="clashes"></div>
    <div id="list"></div>
  </main>
  <aside aria-label="Sent to agents">
    <h2>Sent to agents</h2>
    <ul class="sent" id="sent"></ul>
  </aside>
</div>
<script>
const WORD = { red: 'Needs you', yellow: 'Waiting', green: 'Fine' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const $ = (id) => document.getElementById(id);
const headers = { 'X-Supervisor': '1' };
let last = '';

function row(a) {
  const proof = a.evidence.length
    ? '<ul class="proof">' + a.evidence.map((e) => '<li class="' + (e.ok ? 'yes' : 'no') + '"><i aria-hidden="true">' + (e.ok ? '✓' : '✕') + '</i><span>' + esc(e.label) + '</span></li>').join('') + '</ul>'
    : '';
  const plain = a.plain ? '<p class="plain"><span>In plain words, by Muse</span>' + esc(a.plain) + '</p>' : '';
  let acts = '';
  let ask = '';
  if (a.ask) {
    if (a.ask.detail) ask += '<code class="cmd">' + esc(a.ask.detail) + '</code>';
    ask += '<p class="hint">' + esc(a.ask.hint) + '</p>';
    acts += a.ask.options.map((o, i) => '<button data-kind="answer" data-agent="' + esc(a.name) + '" data-option="' + i + '"' + (i === a.ask.safeIndex ? ' class="main"' : '') + '>' + esc(o) + (i === a.ask.safeIndex ? ' (safe)' : '') + '</button>').join('');
  }
  if (a.rescue) acts += '<button class="main" data-kind="rescue" data-agent="' + esc(a.name) + '" data-rescue="' + esc(a.rescue.kind) + '">' + esc(a.rescue.label) + '</button>';
  if (a.sendBack) acts += '<button class="main" data-kind="sendback" data-agent="' + esc(a.name) + '">Send back</button>';
  if (a.recheck) acts += '<button data-kind="recheck" data-agent="' + esc(a.name) + '">Recheck</button>';
  return '<article class="agent"><div class="light ' + a.light + '"><span class="dot" aria-hidden="true"></span>' + WORD[a.light] + '</div><div>'
    + '<p class="who"><b>' + esc(a.name) + '</b> · ' + esc(a.project) + '</p><p class="line">' + esc(a.line) + '</p>' + plain + ask + proof
    + (acts ? '<div class="acts">' + acts + '</div>' : '') + '</div></article>';
}

const HEX = '<svg viewBox="0 0 24 27"><path d="M12 .6 23.4 7.2v12.6L12 26.4.6 19.8V7.2Z"/></svg>';

function paint(s) {
  $('head').textContent = s.headline;
  const comb = $('comb');
  const ids = [...s.agents].sort((a, b) => a.name.localeCompare(b.name));
  if (comb.children.length !== ids.length) comb.innerHTML = ids.map((a) => '<div class="cell" data-id="' + esc(a.id) + '">' + HEX + '<span>' + esc(a.name[0]) + '</span></div>').join('');
  ids.forEach((a) => { const c = comb.querySelector('[data-id="' + a.id + '"]'); if (c) c.className = 'cell ' + a.light; });
  $('clashes').innerHTML = s.conflicts.map((c) => '<div class="clash"><p class="line">' + esc(c.line) + '</p><p class="hint">' + esc(c.suggestion) + '</p><div class="acts"><button class="main" data-kind="sync" data-agent="' + esc(c.agent) + '">Tell ' + esc(c.agent) + ' to stop</button></div></div>').join('');
  // Rows are kept unless their own content changed, in order: a repaint between
  // a press and its release would swallow the click.
  const list = $('list');
  const keep = new Map([...list.children].map((n) => [n.dataset.id, n]));
  s.agents.forEach((a, i) => {
    const html = row(a);
    let n = keep.get(a.id);
    if (!n || n.dataset.html !== html) {
      const box = document.createElement('div');
      box.innerHTML = html;
      const fresh = box.firstElementChild;
      fresh.dataset.id = a.id;
      fresh.dataset.html = html;
      if (n) n.replaceWith(fresh);
      n = fresh;
    }
    keep.delete(a.id);
    if (list.children[i] !== n) list.insertBefore(n, list.children[i] ?? null);
  });
  keep.forEach((n) => n.remove());
  $('sent').innerHTML = s.sent.length
    ? s.sent.map((m) => '<li><time>' + new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) + '</time><b>' + esc(m.to) + '</b><q>' + esc(m.message) + '</q></li>').join('')
    : '<li class="empty">Nothing yet. Every line a button types into an agent shows here.</li>';
  const note = $('note');
  note.textContent = s.fleetNote;
  note.className = s.fleetOk ? 'note' : 'note bad';
}

async function tick() {
  try {
    const res = await fetch('/state', { headers });
    const s = await res.json();
    const now = JSON.stringify({ ...s, checkedAt: 0 });
    if (now !== last) { last = now; paint(s); }
  } catch {
    $('note').textContent = 'Supervisor stopped. Start it again to see your agents.';
    $('note').className = 'note bad';
  }
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-kind]');
  if (!b) return;
  const d = b.dataset;
  const action = { kind: d.kind, agent: d.agent };
  if (d.rescue) action.rescue = d.rescue;
  if (d.option !== undefined) action.option = Number(d.option);
  b.disabled = true;
  await fetch('/act', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(action) }).catch(() => {});
  last = '';
  tick();
});

tick();
setInterval(tick, 1000);
</script>
</body>
</html>
`;
