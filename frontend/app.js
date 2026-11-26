// Weave prototype app. Talks to the local server's /api: status, a streamed /api/ask (SSE),
// draft approval, app switches, planner mode and reset. All server text is set as text, never HTML.

const S = { status: null, run: null, activity: [], tab: 'apps', busy: false, editing: new Set(), edits: new Map(), offline: false };
const YARN = { calendar: 'calendar', notes: 'notes', tasks: 'tasks', money: 'money' };
const ICON = { calendar: 'i-calendar', notes: 'i-notes', tasks: 'i-tasks', money: 'i-money', email: 'i-mail', fitness: 'i-fitness', travel: 'i-plug', learning: 'i-plug', home: 'i-plug' };
// Short chip labels for the two demo questions; the full question is what gets asked.
const SHORT = {
  'What should I follow up on today, and when can I fit in a workout?': 'Follow-ups and a workout today',
  'How much did I spend on food last week, and what was happening on those days?': 'Food spending last week',
};
const EDITABLE = { create_task: [['title', 'text', 'Title'], ['due', 'date', 'Due']], create_event: [['title', 'text', 'Title'], ['date', 'date', 'Date'], ['start', 'time', 'Start'], ['end', 'time', 'End']] };

/* ---------- Small DOM helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return node;
}
function icon(id, cls = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}
const swatch = (yarn) => el('span', { class: 'swatch', 'data-yarn': yarn, 'aria-hidden': 'true' });
const spinner = () => el('span', { class: 'spinner', 'aria-hidden': 'true' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const listJoin = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/* ---------- Formatting ---------- */
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDate = (iso) => (iso ? dayFmt.format(new Date(`${iso}T00:00:00`)) : '');
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const clock = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
function fmtArgs(args) {
  if (!args || typeof args !== 'object') return '';
  return Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k.replace(/_/g, ' ')} ${Array.isArray(v) ? v.join(', ') : String(v).slice(0, 48)}`)
    .join(', ');
}
function describeRecord(r) {
  switch (r.kind) {
    case 'event': return { title: r.title, meta: [`${fmtDate(r.date)}, ${r.start} to ${r.end}`, r.location].filter(Boolean).join(', '), snippet: r.attendees?.length ? `With ${listJoin(r.attendees)}` : '' };
    case 'task': return { title: r.title, meta: [r.due ? `Due ${fmtDate(r.due)}` : 'No due date', r.list && `${r.list} list`, r.status === 'done' && 'done'].filter(Boolean).join(', '), snippet: '' };
    case 'note': return { title: r.title, meta: r.updated ? `Updated ${fmtDate(r.updated)}` : '', snippet: r.snippet ?? '' };
    case 'transaction': return { title: r.merchant, meta: `${money.format(r.amount)}, ${fmtDate(r.date)}`, snippet: r.category ?? '' };
    case 'summary': return { title: r.title, meta: `${money.format(r.total)} across ${plural(r.count, 'purchase')}`, snippet: '' };
    default: return { title: r.title ?? r.id, meta: '', snippet: '' };
  }
}

/* ---------- Server ---------- */
async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
let toastTimer;
function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 5000);
}

async function loadStatus() {
  try {
    const r = await api('/api/status');
    if (!r.ok) throw new Error();
    S.status = r.data;
    S.offline = false;
  } catch {
    S.offline = true;
  }
  renderAll();
  if (!S.offline) loadActivity();
}
async function loadActivity() {
  try {
    const r = await api('/api/activity');
    if (r.ok) S.activity = r.data.activity ?? [];
  } catch { /* the activity tab keeps what it had */ }
  renderActivity();
}

/* ---------- Top bar ---------- */
function renderBar() {
  $('#today').textContent = S.status?.todayLabel ?? '';
  const planner = $('#planner');
  planner.replaceChildren();
  if (!S.status) return;
  const { mode, planners } = S.status;
  const options = [
    { id: 'claude', label: 'Claude', disabled: !planners.claude.credentials, why: 'No Anthropic API key found. Set ANTHROPIC_API_KEY and restart the server.' },
    { id: 'offline', label: 'Offline', disabled: false },
  ];
  for (const o of options) {
    const checked = o.id === mode;
    planner.append(el('button', {
      type: 'button', role: 'radio', 'aria-checked': String(checked), tabindex: checked ? '0' : '-1',
      disabled: S.busy || (o.disabled && !checked), title: o.disabled ? o.why : `Plan with ${o.label}`, 'data-mode': o.id,
      onclick: () => setMode(o.id),
      onkeydown: (e) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        const other = options.find((x) => x.id !== o.id);
        if (!other.disabled) { setMode(other.id); requestAnimationFrame(() => $(`#planner [data-mode="${other.id}"]`)?.focus()); }
      },
    }, o.label));
    if (o.id === 'offline') planner.lastChild.title = 'Offline script: real MCP calls, hand-written reasoning for the two example questions';
  }
}
async function setMode(mode) {
  if (!S.status || S.status.mode === mode || S.busy) return;
  const r = await api('/api/mode', { mode });
  if (!r.ok) return toast(r.data.error ?? "Couldn't switch the planner.");
  S.status = r.data;
  renderBar();
  renderAsk();
}

function renderReset(confirming = false) {
  const box = $('#reset');
  box.replaceChildren();
  if (!confirming) {
    box.append(el('button', { class: 'btn btn-quiet btn-sm', type: 'button', disabled: S.busy || S.offline, onclick: () => { renderReset(true); $('#reset [data-confirm]')?.focus(); } },
      icon('i-replay'), el('span', { text: 'Reset demo' })));
    return;
  }
  box.append(
    el('span', { class: 'reset-q', text: 'Restore the sample data?' }),
    el('button', { class: 'btn btn-primary btn-sm', type: 'button', 'data-confirm': true, onclick: doReset }, 'Reset'),
    el('button', { class: 'btn btn-link btn-sm', type: 'button', onclick: () => renderReset(false) }, 'Cancel'),
  );
}
async function doReset() {
  const box = $('#reset');
  box.replaceChildren(spinner(), el('span', { class: 'reset-q', text: 'Restarting the MCP servers' }));
  const r = await api('/api/reset', {});
  if (r.ok) {
    S.status = r.data;
    S.run = null;
    S.editing.clear();
  } else toast(r.data.error ?? "Couldn't reset the demo.");
  renderAll();
  loadActivity();
}

/* ---------- Ask ---------- */
function renderAsk() {
  const hour = S.status?.hour ?? new Date().getHours();
  $('#greeting').textContent = hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.';
  const suggest = $('#suggest');
  suggest.replaceChildren();
  const main = $('#main');
  main.querySelector('.notice[data-offline]')?.remove();
  if (S.offline) {
    $('#ask-sub').textContent = 'Weave reads only what a question needs, cites every record, and holds changes for your OK.';
    $('.ask').append(el('div', { class: 'notice', 'data-offline': true, role: 'alert' },
      icon('i-alert'),
      el('div', {},
        el('strong', { text: "Can't reach the Weave server." }),
        el('p', { text: 'Start it from the project folder with npm start, then try again.' }),
        el('button', { class: 'btn btn-quiet btn-sm', type: 'button', onclick: loadStatus }, 'Try again'))));
    setBusy(false);
    return;
  }
  if (!S.status) { setBusy(S.busy); return; } // still loading: the controls wait for the server
  for (const q of S.status.suggestions ?? []) {
    suggest.append(el('button', { type: 'button', disabled: S.busy, title: q, 'aria-label': `Ask: ${q}`, onclick: () => { $('#q').value = q; autosize(); ask(q); } }, SHORT[q] ?? q));
  }
  const offline = S.status.mode === 'offline';
  const canClaude = S.status.planners.claude.credentials;
  $('#ask-sub').textContent = offline
    ? `The offline planner answers the two example questions below with real MCP calls on sample data.${canClaude ? ' Switch to Claude to ask anything.' : ' Add an Anthropic API key to ask anything.'}`
    : `Claude plans which MCP tools to call, cites every record it reads, and holds changes for your OK.`;
  setBusy(S.busy);
}

function setBusy(busy) {
  S.busy = busy;
  const btn = $('#ask-btn');
  btn.disabled = busy || S.offline || !S.status;
  btn.replaceChildren(...(busy ? [spinner(), el('span', { text: 'Asking' })] : [el('span', { text: 'Ask' }), icon('i-enter')]));
  $('#q').disabled = busy || S.offline || !S.status;
  document.querySelectorAll('#suggest button').forEach((b) => { b.disabled = busy; });
  document.querySelectorAll('.switch').forEach((b) => { if (!b.dataset.broken) b.disabled = busy; });
  renderBar();
  $('#run').setAttribute('aria-busy', String(busy));
  if (!$('#reset [data-confirm]')) renderReset(false);
}

function autosize() {
  const q = $('#q');
  q.style.height = 'auto';
  q.style.height = `${Math.min(q.scrollHeight, 200)}px`;
}

async function ask(question) {
  question = question.trim();
  if (!question || S.busy || S.offline) return;
  S.run = { question, steps: [], proposals: new Map(), answer: null, error: null, done: false };
  S.editing.clear();
  S.edits.clear();
  setBusy(true);
  renderRun();
  renderSources();
  $('#run').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  try {
    const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
    if (!res.ok || !res.body) {
      const j = await res.json().catch(() => ({}));
      throw Object.assign(new Error(j.error ?? `The server answered ${res.status}.`), { known: true });
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let cut;
      while ((cut = buf.indexOf('\n\n')) >= 0) {
        onEvent(buf.slice(0, cut));
        buf = buf.slice(cut + 2);
      }
    }
  } catch (err) {
    S.run.error = err.known ? { message: err.message, hint: '' } : { message: 'The connection to the Weave server dropped.', hint: 'Check that the server is still running, then ask again.' };
  }
  S.run.done = true;
  setBusy(false);
  renderRun();
  renderSources();
  await loadActivity();
  if (S.run.answer) selectTab('sources');
}

let frame = 0;
function onEvent(block) {
  let event = 'message', data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7);
    else if (line.startsWith('data: ')) data += line.slice(6);
  }
  let payload;
  try { payload = JSON.parse(data); } catch { return; }
  const run = S.run;
  if (event === 'run') Object.assign(run, { id: payload.id, mode: payload.mode, model: payload.model });
  else if (event === 'step') {
    const i = run.steps.findIndex((s) => s.id === payload.id);
    if (i >= 0) run.steps[i] = payload; else run.steps.push(payload);
  } else if (event === 'proposal') run.proposals.set(payload.id, payload);
  else if (event === 'answer') {
    run.answer = payload;
    for (const p of payload.proposals ?? []) run.proposals.set(p.id, { ...run.proposals.get(p.id), ...p });
  } else if (event === 'error') run.error = payload;
  else if (event === 'done') run.ms = payload.ms;
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; renderRun(); });
}

/* ---------- The run ---------- */
function sourceByN(n) { return S.run?.answer?.sources.find((s) => s.n === n); }
function nFor(sourceId) { return S.run?.answer?.sources.find((s) => s.source_id === sourceId)?.n ?? null; }

function citeButton(n) {
  const src = sourceByN(n);
  if (!src) return null;
  const { title } = describeRecord(src.record);
  return el('button', {
    class: 'cite', type: 'button', 'data-n': n, 'data-yarn': YARN[src.server] ?? src.server,
    'aria-label': `Source ${n}: ${src.app}, ${title}`,
    onclick: () => openSource(n), onmouseenter: () => light(n), onmouseleave: () => light(null), onfocus: () => light(n), onblur: () => light(null),
  }, String(n));
}

function heldProposals() {
  // Held steps arrive in the same order as the drafts they stand for.
  const drafts = [...(S.run?.proposals.values() ?? [])];
  let k = 0;
  return S.run.steps.map((s) => (s.kind === 'write' ? drafts[k++] : null));
}

function renderRun() {
  const box = $('#run');
  const run = S.run;
  if (!run) { box.hidden = true; box.replaceChildren(); return; }
  box.hidden = false;
  const drafts = heldProposals();

  const picks = el('ol', { class: 'picks', 'aria-label': 'MCP calls in this run' }, run.steps.map((s, i) => {
    const d = drafts[i];
    let state = s.status === 'running' ? 'is-running' : s.status === 'error' ? 'is-error' : s.kind === 'write' ? 'is-held' : '';
    if (d?.status === 'done' || d?.status === 'unverified') state = '';
    if (d?.status === 'dismissed' || d?.status === 'failed') state = 'is-held is-dropped';
    const label = `${s.app} ${s.tool}: ${s.kind === 'write' ? (d?.status === 'done' ? 'approved and added' : d?.status === 'dismissed' ? 'dismissed' : 'held for your approval') : s.summary ?? s.status}`;
    return el('li', { class: `pick ${state}`, 'data-yarn': YARN[s.server] ?? s.server, title: label, 'aria-label': label });
  }));

  const reads = run.steps.filter((s) => s.kind === 'read');
  const pending = [...run.proposals.values()].filter((p) => p.status === 'pending').length;
  let status;
  if (!run.done) {
    const last = run.steps.at(-1);
    status = [spinner(), el('span', { text: last ? `${last.kind === 'write' ? 'Drafting a change in' : 'Reading'} ${last.app}` : 'Planning which apps to read' })];
  } else if (run.error && !run.answer) status = [el('span', { text: 'Stopped before an answer.' })];
  else {
    const apps = [...new Set(reads.filter((s) => s.status === 'done').map((s) => s.app))];
    status = [el('span', { text: `Woven from ${plural(reads.length, 'read')}${apps.length ? ` across ${listJoin(apps)}` : ''}.${pending ? ` ${pending === 1 ? 'One change waits' : `${pending} changes wait`} for your OK.` : ''}` })];
  }

  const steps = el('ol', { class: 'steps' }, run.steps.map((s, i) => {
    const d = drafts[i];
    const held = s.kind === 'write';
    let out = s.status === 'running' ? [spinner(), 'reading'] : s.status === 'error' ? ['failed'] : held ? [d?.status === 'done' ? 'approved, added' : d?.status === 'dismissed' ? 'dismissed' : d?.status === 'failed' ? 'failed' : 'held for approval'] : [s.summary ?? 'done', s.ms !== undefined ? `, ${s.ms} ms` : ''];
    return el('li', { class: `step${held && (!d || d.status === 'pending') ? ' is-held' : ''}${s.status === 'error' ? ' is-error' : ''}` },
      swatch(YARN[s.server] ?? s.server),
      el('span', { class: 'step-app', text: s.app }),
      el('span', { class: 'step-call' }, el('code', { text: s.tool }), ' ', el('span', { class: 'step-args', text: fmtArgs(s.args) })),
      el('span', { class: 'step-out' }, out));
  }));
  const calls = el('details', { class: 'calls', open: run.callsOpen ?? !run.answer },
    el('summary', { onclick: (e) => { run.callsOpen = !e.currentTarget.parentElement.open; } }, `MCP calls in this run (${run.steps.length})`), steps);

  const parts = [
    el('p', { class: 'run-q', text: run.question }),
    el('div', { class: 'loomstrip' }, picks, el('p', { class: 'run-status', role: 'status' }, status)),
    run.steps.length ? calls : null,
  ];

  if (run.error) {
    parts.push(el('div', { class: 'notice run-error', role: 'alert' }, icon('i-alert'),
      el('div', {}, el('strong', { text: run.error.message ?? 'Something went wrong.' }), run.error.hint ? el('p', { text: run.error.hint }) : null)));
  }

  if (run.answer) {
    const a = run.answer;
    const answer = el('div', { class: 'answer' }, el('h2', { class: 'answer-head', text: a.headline || 'Here is what I found.' }));
    for (const sec of a.sections) {
      answer.append(el('div', { class: 'answer-section' },
        el('h3', { text: sec.title }),
        el('ul', { class: 'items' }, sec.items.map((it) => el('li', { class: 'item' },
          el('span', { class: 'item-text', text: it.text }),
          it.detail ? el('span', { class: 'item-detail', text: it.detail }) : null,
          el('span', { class: 'cites' }, it.sourceIds.map((id) => citeButton(nFor(id)))))))));
    }
    if (a.caveats.length) answer.append(el('div', { class: 'caveats' }, a.caveats.map((c) => el('p', {}, icon('i-alert'), el('span', { text: c })))));
    const st = a.stats;
    answer.append(el('p', { class: 'stats', text: `${plural(st.reads, 'MCP read')} in ${st.ms} ms. Planner: ${st.mode === 'claude' ? `Claude (${st.model})` : 'offline script'}.` }));
    parts.push(answer);
  }

  const props = [...run.proposals.values()];
  if (props.length && (run.answer || run.done)) parts.push(renderDrafts(props));

  const focusId = document.activeElement?.id;
  box.replaceChildren(...parts.filter(Boolean));
  if (focusId && document.getElementById(focusId)) document.getElementById(focusId).focus();
}

/* ---------- Drafts ---------- */
function renderDrafts(props) {
  const pending = props.filter((p) => p.status === 'pending').length;
  return el('div', { class: 'drafts' },
    el('h3', {}, 'Changes Weave drafted'),
    el('p', { class: 'drafts-sub', text: pending ? 'Nothing below has happened yet. Each one runs only if you approve it.' : 'Every draft has been decided.' }),
    props.map(renderDraft));
}

function renderDraft(p) {
  const yarn = YARN[p.server] ?? p.server;
  const editing = S.editing.has(p.id) && p.status === 'pending';
  const args = p.args ?? {};
  const meta = p.tool === 'create_event'
    ? [['Date', fmtDate(args.date)], ['Time', `${args.start} to ${args.end}`], args.notes && ['Notes', args.notes]]
    : [['Due', args.due ? fmtDate(args.due) : 'No date'], args.list && ['List', args.list]];
  const card = el('article', { class: `draft${p.status === 'done' || p.status === 'unverified' ? ' is-done' : ''}${p.status === 'dismissed' ? ' is-dismissed' : ''}`, 'data-yarn': yarn, 'aria-label': `Draft: ${p.toolTitle} in ${p.app}` },
    el('p', { class: 'draft-head' }, swatch(yarn), `${p.toolTitle} in ${p.app}`),
    el('p', { class: 'draft-title', text: args.title }),
    el('dl', { class: 'draft-meta' }, meta.filter(Boolean).map(([k, v]) => el('div', {}, el('dt', { text: k }), el('dd', { text: v })))),
    p.why ? el('p', { class: 'draft-why' }, p.why, ...(p.sourceIds ?? []).map((id) => citeButton(nFor(id)))) : null);

  if (editing) {
    const fields = (EDITABLE[p.tool] ?? []).map(([key, type, label], i) => el('div', { class: `field${key === 'title' ? ' field-wide' : ''}` },
      el('label', { for: `edit-${p.id}-${key}`, text: label }),
      el('input', { id: `edit-${p.id}-${key}`, name: key, type, value: S.edits.get(p.id)?.[key] ?? args[key] ?? '', required: key === 'title', autocomplete: 'off', oninput: (e) => S.edits.set(p.id, { ...S.edits.get(p.id), [key]: e.target.value }) })));
    const form = el('form', { class: 'draft-edit', onsubmit: (e) => { e.preventDefault(); const changes = Object.fromEntries(new FormData(e.currentTarget)); approve(p, changes); } },
      fields,
      el('div', { class: 'draft-actions field-wide' },
        el('button', { class: 'btn btn-primary', type: 'submit' }, icon('i-check'), 'Approve with changes'),
        el('button', { class: 'btn btn-link', type: 'button', onclick: () => { S.editing.delete(p.id); S.edits.delete(p.id); renderRun(); $(`#approve-${p.id}`)?.focus(); } }, 'Cancel')));
    card.append(form);
    return card;
  }

  if (p.status === 'pending') {
    card.append(el('div', { class: 'draft-actions' },
      el('button', { class: 'btn btn-primary', type: 'button', id: `approve-${p.id}`, onclick: () => approve(p) }, icon('i-check'), 'Approve'),
      el('button', { class: 'btn btn-quiet', type: 'button', onclick: () => { S.editing.add(p.id); renderRun(); requestAnimationFrame(() => document.querySelector(`#edit-${p.id}-title`)?.focus()); } }, icon('i-pencil'), 'Edit first'),
      el('button', { class: 'btn btn-link', type: 'button', onclick: () => dismiss(p) }, 'Dismiss')));
  } else if (p.status === 'running') {
    card.append(el('p', { class: 'draft-result is-muted' }, spinner(), `Adding to ${p.app}, then reading it back to confirm`));
  } else if (p.status === 'done') {
    const conflicts = (p.conflicts ?? []).map((c) => `“${c.title}” (${c.start} to ${c.end})`);
    card.append(el('p', { class: 'draft-result is-ok', role: 'status' }, icon('i-check'),
      el('span', {}, `Added to ${p.app} and read back to confirm.${conflicts.length ? ` It overlaps ${listJoin(conflicts)}.` : ''}`)));
  } else if (p.status === 'unverified') {
    card.append(el('p', { class: 'draft-result is-warn', role: 'status' }, icon('i-alert'), el('span', { text: `${p.app} accepted it, but Weave couldn't read it back. Check ${p.app} before relying on it.` })));
  } else if (p.status === 'failed') {
    card.append(el('p', { class: 'draft-result is-bad', role: 'alert' }, icon('i-alert'), el('span', { text: `${p.app} refused it: ${p.error ?? 'no reason given.'} Nothing was changed.` })));
  } else if (p.status === 'dismissed') {
    card.append(el('p', { class: 'draft-result is-muted', role: 'status' }, icon('i-x'), el('span', { text: 'Dismissed. Nothing was changed.' })));
  }
  return card;
}

async function approve(p, changes = {}) {
  S.editing.delete(p.id);
  S.edits.delete(p.id);
  p.status = 'running';
  renderRun();
  const r = await api(`/api/proposals/${encodeURIComponent(p.id)}/approve`, { changes });
  if (r.data.proposal) Object.assign(p, r.data.proposal);
  else { p.status = 'pending'; toast(r.data.error ?? "Couldn't approve that draft."); }
  if (r.status === 409 && r.data.error) toast(r.data.error);
  renderRun();
  loadActivity();
}
async function dismiss(p) {
  const r = await api(`/api/proposals/${encodeURIComponent(p.id)}/dismiss`, {});
  if (r.data.proposal) Object.assign(p, r.data.proposal);
  else toast(r.data.error ?? "Couldn't dismiss that draft.");
  renderRun();
}

/* ---------- Inspector ---------- */
const TABS = ['apps', 'sources', 'activity'];
function selectTab(name, focus = false) {
  if (!TABS.includes(name)) name = 'apps';
  S.tab = name;
  for (const t of TABS) {
    const tab = $(`#tab-${t}`);
    const on = t === name;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $(`#panel-${t}`).hidden = !on;
  }
  if (focus) $(`#tab-${name}`).focus();
  const url = new URL(location.href);
  url.searchParams.set('tab', name);
  history.replaceState(null, '', url);
}

function renderApps() {
  const panel = $('#panel-apps');
  if (S.offline) {
    panel.replaceChildren(el('div', { class: 'empty' }, el('strong', { text: 'No apps to show' }), 'The Weave server is not running, so no MCP servers are connected.'));
    return;
  }
  if (!S.status) { panel.replaceChildren(...[1, 2, 3, 4].map(() => el('div', { class: 'skeleton', 'aria-hidden': 'true' })), el('p', { class: 'panel-note', text: 'Connecting to the MCP servers' })); return; }
  const open = new Set([...panel.querySelectorAll('details[open]')].map((d) => d.dataset.app));
  const apps = el('ul', { class: 'apps' }, S.status.apps.map((a) => {
    const on = a.enabled && a.status === 'connected';
    const broken = a.status !== 'connected';
    const reads = a.tools.filter((t) => t.readOnly).length;
    const line = broken ? `Couldn't connect: ${a.error ?? a.status}` : a.enabled ? `${a.blurb}. ${plural(a.tools.length, 'tool')}, sample data.` : 'Switched off. Weave will not read it.';
    return el('li', { class: `app${on ? '' : ' is-off'}`, 'data-yarn': YARN[a.id] ?? a.id },
      el('div', { class: 'app-row' },
        swatch(YARN[a.id] ?? a.id),
        el('div', {}, el('div', { class: 'app-name', text: a.name }), el('div', { class: 'app-blurb', text: line })),
        el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(a.enabled), 'aria-label': `Let Weave use ${a.name}`, disabled: broken || S.busy, 'data-broken': broken ? 'true' : null, onclick: () => toggleApp(a) })),
      a.tools.length ? el('details', { 'data-app': a.id, open: open.has(a.id) },
        el('summary', {}, `${plural(a.tools.length, 'tool')}: ${reads} read, ${a.tools.length - reads} ask first`),
        el('ul', { class: 'tools' }, a.tools.map((t) => el('li', {}, el('code', { text: t.name, title: t.description }), el('span', { class: `tool-kind${t.readOnly ? '' : ' is-write'}`, text: t.readOnly ? 'reads' : 'asks first' }))))) : null);
  }));
  panel.replaceChildren(
    el('h2', { text: 'Connected through MCP' }),
    el('p', { class: 'panel-note', text: 'Switch an app off and Weave stops reading it. Tools that change data always ask first.' }),
    apps,
    el('h2', { text: 'Planned, not connected' }),
    el('ul', { class: 'planned' }, (S.status.planned ?? []).map((p) => el('li', {}, swatch(p.id), el('span', {}, el('span', { text: p.name }), el('br'), el('span', { text: p.blurb }))))));
}
async function toggleApp(a) {
  const r = await api(`/api/apps/${encodeURIComponent(a.id)}`, { enabled: !a.enabled });
  if (!r.ok) return toast(r.data.error ?? `Couldn't switch ${a.name}.`);
  S.status = r.data;
  renderApps();
  $(`.app[data-yarn="${YARN[a.id] ?? a.id}"] .switch`)?.focus();
}

function renderSources() {
  const panel = $('#panel-sources');
  const count = $('#count-sources');
  const a = S.run?.answer;
  if (!a) {
    count.textContent = '';
    if (S.busy) { panel.replaceChildren(...[1, 2, 3].map(() => el('div', { class: 'skeleton', 'aria-hidden': 'true' })), el('p', { class: 'panel-note', text: 'Records appear here once the answer is ready.' })); return; }
    panel.replaceChildren(el('div', { class: 'empty' }, el('strong', { text: 'No sources yet' }), 'Every record Weave reads lands here, numbered when the answer cites it.'));
    return;
  }
  const cited = a.sources.filter((s) => s.n);
  const rest = a.sources.filter((s) => !s.n);
  count.textContent = String(cited.length);
  const card = (s) => {
    const r = describeRecord(s.record);
    return el('li', { class: 'source', id: s.n ? `src-${s.n}` : null, tabindex: s.n ? '-1' : null, 'data-yarn': YARN[s.server] ?? s.server, 'data-n': s.n ?? null },
      el('span', { class: 'source-n', text: s.n ? String(s.n) : '' }),
      el('span', { class: 'source-app' }, icon(ICON[s.server] ?? 'i-plug'), s.app),
      el('span', { class: 'source-title', text: r.title }),
      r.meta ? el('span', { class: 'source-meta', text: r.meta }) : null,
      r.snippet ? el('span', { class: 'source-snippet', text: r.snippet }) : null);
  };
  panel.replaceChildren(
    el('h2', { text: cited.length ? 'Cited in the answer' : 'Read for this answer' }),
    cited.length ? el('ol', { class: 'sources' }, cited.map(card)) : el('p', { class: 'panel-note', text: 'The answer cites no records.' }),
    rest.length ? el('details', { class: 'uncited' }, el('summary', {}, `Also read, not cited (${rest.length})`), el('ul', { class: 'sources' }, rest.map(card))) : null);
}

function light(n) {
  document.querySelectorAll('.is-lit').forEach((x) => x.classList.remove('is-lit'));
  if (!n) return;
  document.querySelectorAll(`.cite[data-n="${n}"]`).forEach((c) => c.classList.add('is-lit'));
  const card = $(`#src-${n}`);
  if (!card) return;
  card.classList.add('is-lit');
  if (S.tab === 'sources' && matchMedia('(min-width: 64.01rem)').matches) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function openSource(n) {
  selectTab('sources');
  const card = $(`#src-${n}`);
  if (!card) return;
  card.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  card.focus({ preventScroll: true });
  light(n);
}

function renderActivity() {
  const panel = $('#panel-activity');
  const items = [...S.activity].reverse();
  $('#count-activity').textContent = items.length ? String(items.length) : '';
  if (S.offline) { panel.replaceChildren(el('div', { class: 'empty' }, el('strong', { text: 'No activity' }), 'Start the Weave server to see its MCP messages.')); return; }
  if (!items.length) { panel.replaceChildren(el('div', { class: 'empty' }, el('strong', { text: 'No MCP calls yet' }), 'Ask a question and every tools/call appears here.')); return; }
  panel.replaceChildren(
    el('p', { class: 'panel-note', text: 'Every MCP message between Weave and your apps, newest first.' }),
    el('ol', { class: 'log' }, items.map((x) => {
      const flags = [];
      if (x.method === 'held') flags.push(el('span', { class: 'log-flag is-held', text: 'held for approval' }));
      else if (x.summary === 'approved by you') flags.push(el('span', { class: 'log-flag', text: 'approved by you' }));
      else if (x.summary === 'read back to confirm') flags.push(el('span', { class: 'log-flag', text: 'read back' }));
      if (x.isError) flags.push(el('span', { class: 'log-flag is-error', text: 'error' }));
      const app = S.status?.apps.find((a) => a.id === x.server)?.name ?? x.server;
      return el('li', {},
        swatch(YARN[x.server] ?? x.server),
        el('span', { class: 'log-what' }, `${app} `, x.tool ? el('code', { text: x.tool }) : el('span', { class: 'log-method', text: x.method }), x.tool ? el('span', { class: 'log-method', text: ` ${x.method === 'held' ? 'drafted' : x.method}` }) : null, flags),
        el('span', { class: 'log-ms', text: x.method === 'held' ? clock(x.at) : `${x.ms} ms` }),
        x.args && Object.keys(x.args).length ? el('span', { class: 'log-args', text: fmtArgs(x.args) }) : null);
    })));
}

function renderAll() {
  renderBar();
  renderReset(false);
  renderAsk();
  renderApps();
  renderRun();
  renderSources();
  renderActivity();
}

/* ---------- Wiring ---------- */
$('#composer').addEventListener('submit', (e) => { e.preventDefault(); ask($('#q').value); });
$('#q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask($('#q').value); }
});
$('#q').addEventListener('input', autosize);
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab));
  tab.addEventListener('keydown', (e) => {
    const i = TABS.indexOf(tab.dataset.tab);
    if (e.key === 'ArrowRight') selectTab(TABS[(i + 1) % TABS.length], true);
    else if (e.key === 'ArrowLeft') selectTab(TABS[(i + TABS.length - 1) % TABS.length], true);
    else if (e.key === 'Home') selectTab(TABS[0], true);
    else if (e.key === 'End') selectTab(TABS.at(-1), true);
  });
});

selectTab(new URL(location.href).searchParams.get('tab') ?? 'apps');
renderAll();
loadStatus();
