// Weave prototype UI. Plain modules, no build step.
import { icons } from './icons.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = (name, cls = '') => `<span class="i ${cls}">${icons[name] ?? ''}</span>`;
const APP_ICON = { calendar: 'calendar', notes: 'notes', tasks: 'tasks', money: 'money', email: 'mail', fitness: 'fitness', travel: 'travel', learning: 'learning', home: 'home' };

const state = {
  status: null,
  run: null,
  open: new Set(),
  tab: 'sources',
  activity: [],
  editing: null,
  busy: new Set(),
};

// ---------- formatting ----------
const pad = (n) => String(n).padStart(2, '0');
function fmtTime(hhmm, suffix = true) {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = ((h + 11) % 12) + 1;
  return suffix ? `${h12}:${pad(m)} ${h >= 12 ? 'pm' : 'am'}` : `${h12}:${pad(m)}`;
}
function fmtRange(a, b) {
  const half = (t) => Number(t.split(':')[0]) >= 12;
  return half(a) === half(b) ? `${fmtTime(a, false)}–${fmtTime(b)}` : `${fmtTime(a)}–${fmtTime(b)}`;
}
const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
function relDay(iso) {
  if (!iso) return '';
  const diff = Math.round((parseISO(iso) - parseISO(state.status.today)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return parseISO(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
function modelName(id = '') {
  const parts = id.replace(/^claude-/, '').split('-');
  return parts.length ? `${cap(parts[0])} ${parts.slice(1).join('.')}`.trim() : id;
}
const fmtDuration = (ms) => (ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`);
const plannerLabel = (mode, model) => (mode === 'claude' ? `Claude ${modelName(model)}` : 'Offline script');
const compactArgs = (args = {}) =>
  Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== '' && v !== null)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`)
    .join(' ');

// ---------- API ----------
async function api(url, body) {
  const res = await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.proposal) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

// ---------- top bar ----------
function renderTopbar() {
  const s = state.status;
  $('#today').textContent = s.todayLabel;
  const claude = s.planners.claude;
  $('#planner').innerHTML = `
    <button type="button" data-mode="claude" aria-pressed="${s.mode === 'claude'}" ${claude.credentials ? '' : 'disabled'}
      title="${claude.credentials ? `Claude chooses the MCP tools (${esc(claude.model)}, effort ${esc(claude.effort)})` : 'Set ANTHROPIC_API_KEY and restart the server to use Claude'}">
      Claude <span class="sub">${claude.credentials ? esc(modelName(claude.model)) : 'needs a key'}</span>
    </button>
    <button type="button" data-mode="offline" aria-pressed="${s.mode === 'offline'}" title="A fixed script for the two demo questions. Same MCP calls, no model.">
      Offline <span class="sub">script</span>
    </button>`;
}

// ---------- rail ----------
function renderRail() {
  const { apps, planned } = state.status;
  $('#apps').innerHTML = apps
    .map((a) => {
      const connected = a.status === 'connected';
      const on = connected && a.enabled;
      const sub = !connected ? 'Not connected' : !a.enabled ? 'Switched off' : `${cap(a.data)} · ${a.tools.length} tools`;
      return `
      <li class="app ${on ? '' : 'off'} ${state.open.has(a.id) ? 'open' : ''}" data-app="${a.id}">
        <div class="app-row">
          <span class="app-icon">${icon(APP_ICON[a.id])}</span>
          <button type="button" class="app-text" data-action="expand" aria-expanded="${state.open.has(a.id)}" title="Show the tools this MCP server offers">
            <span class="app-name">${esc(a.name)}</span>
            <span class="app-sub">${esc(sub)}</span>
          </button>
          <button type="button" class="switch" role="switch" data-action="toggle" aria-checked="${on}" aria-label="Let Weave use ${esc(a.name)}" ${connected ? '' : 'disabled'}></button>
        </div>
        <ul class="app-tools">
          ${a.tools.map((t) => `<li title="${esc(t.description)}"><span>${esc(t.name)}</span><span class="tag ${t.readOnly ? 'read' : 'write'}">${t.readOnly ? 'Reads' : 'Asks first'}</span></li>`).join('')}
        </ul>
      </li>`;
    })
    .join('');
  $('#planned').innerHTML = planned
    .map(
      (p) => `
      <li class="app" title="${esc(p.blurb)}. Not connected yet.">
        <div class="app-row">
          <span class="app-icon">${icon(APP_ICON[p.id] ?? 'plug')}</span>
          <span class="app-text"><span class="app-name">${esc(p.name)}</span></span>
          <span class="pill-planned">Planned</span>
        </div>
      </li>`,
    )
    .join('');
  const tools = apps.flatMap((a) => a.tools);
  const writes = tools.filter((t) => !t.readOnly).map((t) => t.name);
  $('#railFoot').innerHTML = `
    <div><strong>MCP</strong> · ${apps.filter((a) => a.status === 'connected').length} servers · ${tools.length} tools</div>
    <div>Changes always ask first: <span class="mono">${writes.map(esc).join(', ')}</span></div>
    <div style="margin-top:6px">Local prototype. Every app here runs on sample data.</div>`;
  const using = apps.filter((a) => a.status === 'connected' && a.enabled).map((a) => a.name);
  $('#composerMeta').textContent = using.length ? `Reads from ${using.join(', ')}` : 'No apps switched on';
}

// ---------- intro ----------
function renderIntro() {
  const h = state.status.hour;
  $('#greeting').textContent = h < 12 ? 'Good morning.' : h < 17 ? 'Good afternoon.' : 'Good evening.';
  $('#subline').textContent = 'Ask one question across your calendar, notes, tasks and spending. Every answer shows where it came from, and nothing changes without your OK.';
  $('#suggestions').innerHTML = `<h2 class="label">Try asking</h2>${state.status.suggestions
    .map((q) => `<button type="button" class="suggestion" data-q="${esc(q)}"><span class="arrow">→</span><span>${esc(q)}</span></button>`)
    .join('')}`;
}

// ---------- result ----------
function citeButtons(ids, byId) {
  return ids
    .map((id) => byId.get(id))
    .filter((s) => s?.n)
    .sort((a, b) => a.n - b.n)
    .map((s) => `<button type="button" class="cite" data-src="${esc(s.source_id)}" aria-label="Source ${s.n}: ${esc(s.record.title ?? s.record.merchant ?? '')}">${s.n}</button>`)
    .join('');
}

function stepRow(s) {
  const glyph = { running: icon('loader', 'spin wait'), done: icon('check', 'ok'), error: icon('alert', 'err'), held: icon('lock', 'held') }[s.status] ?? '';
  return `<li class="step ${s.kind === 'write' ? 'is-write' : ''} ${s.isNew ? 'is-new' : ''}">
    ${glyph}
    <span class="step-app">${esc(s.app)}</span>
    <span class="step-tool">${esc(s.tool)} <span class="args">${esc(compactArgs(s.args))}</span></span>
    <span class="step-sum">${esc(s.status === 'running' ? 'reading…' : s.summary ?? '')}</span>
    <span class="step-ms">${s.ms != null && s.kind === 'read' ? `${s.ms} ms` : ''}</span>
  </li>`;
}

function draftFacts(p) {
  const a = p.args;
  if (p.tool === 'create_task') return [['clock', a.due ? `Due ${relDay(a.due)}` : 'No due date'], ['tasks', a.list || 'Inbox']];
  if (p.tool === 'create_event') return [['calendar', `${cap(relDay(a.date))}, ${fmtRange(a.start, a.end)}`], a.location ? ['mapPin', a.location] : null].filter(Boolean);
  return Object.entries(a).map(([k, v]) => ['info', `${k}: ${v}`]);
}

function draftCard(p, byId) {
  const kind = { create_task: 'New task', create_event: 'New calendar event' }[p.tool] ?? p.toolTitle;
  const statusMap = {
    pending: ['pending', 'lock', 'Waiting for your OK'],
    running: ['pending', 'loader', 'Adding…'],
    done: ['done', 'checkCircle', 'Done'],
    unverified: ['unverified', 'alert', "Couldn't confirm"],
    failed: ['failed', 'alert', "Didn't go through"],
    dismissed: ['dismissed', 'x', 'Dismissed'],
  };
  const busy = state.busy.has(p.id);
  const [cls, ico, text] = statusMap[busy ? 'running' : p.status] ?? statusMap.pending;
  const editing = state.editing === p.id && p.status === 'pending';
  let body = '';
  if (editing) {
    const a = p.args;
    body = `<div class="edit-grid">
      <label class="field wide">Title<input name="title" value="${esc(a.title)}" /></label>
      ${p.tool === 'create_task' ? `<label class="field">Due<input type="date" name="due" value="${esc(a.due ?? '')}" /></label>` : ''}
      ${p.tool === 'create_event' ? `<label class="field">Date<input type="date" name="date" value="${esc(a.date)}" /></label>
        <label class="field">Starts<input type="time" name="start" value="${esc(a.start)}" /></label>
        <label class="field">Ends<input type="time" name="end" value="${esc(a.end)}" /></label>` : ''}
    </div>
    <div class="draft-actions">
      <button type="button" class="btn btn-text btn-sm" data-action="cancel-edit">Cancel</button>
      <button type="button" class="btn btn-blue btn-sm" data-action="approve-edited">Approve with changes</button>
    </div>`;
  } else {
    body = `<h4 class="draft-title">${esc(p.args.title ?? kind)}</h4>
      <div class="draft-facts">${draftFacts(p).map(([i, t]) => `<span>${icon(i)}${esc(t)}</span>`).join('')}</div>
      ${p.why ? `<div class="draft-why"><em>Why:</em> ${esc(p.why)}${citeButtons(p.sourceIds, byId)}</div>` : ''}`;
    if (p.status === 'pending') {
      body += `<div class="draft-actions">
        <button type="button" class="btn btn-text btn-sm" data-action="dismiss" ${busy ? 'disabled' : ''}>Dismiss</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="edit" ${busy ? 'disabled' : ''}>${icon('pencil')}Edit</button>
        <button type="button" class="btn btn-blue btn-sm" data-action="approve" ${busy ? 'disabled' : ''}>Approve</button>
      </div>`;
    } else if (p.status === 'done' && p.result) {
      const conflicts = (p.conflicts ?? []).length ? ` It overlaps “${esc(p.conflicts[0].title)}”.` : '';
      body += `<div class="draft-result">${icon('checkCircle')}<div>Added to ${esc(p.app)}, then read back from ${esc(p.app)} to confirm <code>${esc(p.result.id)}</code>.${conflicts}</div></div>`;
    } else if (p.status === 'failed' || p.status === 'unverified') {
      body += `<div class="draft-result bad">${icon('alert')}<div>${esc(p.error ?? `${p.app} didn't confirm the change, so Weave isn't calling it done.`)}</div></div>`;
    }
  }
  return `<article class="draft ${p.status === 'dismissed' ? 'is-dismissed' : ''} ${p.status === 'done' ? 'is-done' : ''}" data-proposal="${esc(p.id)}">
    <div class="draft-head">
      <span class="app-icon">${icon(APP_ICON[p.server] ?? 'plug')}</span>
      <span class="draft-kind">${esc(kind)}</span><span>· ${esc(p.app)}</span>
      <span class="status ${cls}">${icon(ico, busy ? 'spin' : '')}${esc(text)}</span>
    </div>
    ${body}
  </article>`;
}

function renderResult() {
  const r = state.run;
  const el = $('#result');
  document.body.classList.toggle('has-result', Boolean(r));
  if (!r) {
    el.innerHTML = '';
    return;
  }
  const a = r.answer;
  const byId = new Map((a?.sources ?? []).map((s) => [s.source_id, s]));
  const reads = r.steps.filter((s) => s.kind === 'read');

  let meta;
  if (r.running) {
    const done = reads.filter((s) => s.status !== 'running').length;
    meta = `<span class="working">${icon('loader', 'spin')}Reading your apps${reads.length ? ` · ${done} of ${reads.length} calls back` : ''}</span><span class="dot"></span><span>${esc(plannerLabel(r.mode, r.model))}</span>`;
  } else {
    const apps = a?.stats.apps ?? [];
    meta = `${apps.length ? `<span class="apps-used">${apps.map((n) => icon(APP_ICON[n.toLowerCase()] ?? 'plug')).join('')}${esc(apps.join(' · '))}</span><span class="dot"></span>` : ''}
      <span>${reads.length} MCP read${reads.length === 1 ? '' : 's'}</span><span class="dot"></span>
      <span>${fmtDuration(a?.stats.ms ?? r.ms ?? 0)}</span><span class="dot"></span>
      <span>${esc(plannerLabel(r.mode, r.model))}</span>
      <span class="dot"></span><button type="button" class="btn btn-text btn-sm" data-action="clear" style="height:24px;margin-left:-6px">Start over</button>`;
  }

  let answerHtml = '';
  if (a) {
    const sections = a.sections
      .map((sec) => {
        const single = sec.items.length === 1;
        return `<section class="section">
          <h3 class="label">${esc(sec.title)}</h3>
          <ol class="items">${sec.items
            .map(
              (it, i) => `<li class="item" style="${single ? 'grid-template-columns:0 1fr;gap:0' : ''}">
                <span class="n">${single ? '' : i + 1}</span>
                <div class="item-text">${esc(it.text)}${citeButtons(it.sourceIds, byId)}</div>
                ${it.detail ? `<div class="item-detail">${esc(it.detail)}</div>` : ''}
              </li>`,
            )
            .join('')}</ol>
        </section>`;
      })
      .join('');
    const pending = a.proposals.filter((p) => p.status === 'pending').length;
    const drafts = a.proposals.length
      ? `<section class="drafts">
          <h3 class="label">${pending ? `Needs your OK <span class="count">${pending}</span>` : 'Changes'}</h3>
          ${a.proposals.map((p) => draftCard(p, byId)).join('')}
        </section>`
      : '';
    const caveats = a.caveats.length ? `<div class="caveats">${a.caveats.map((c) => `<div class="caveat">${icon('info')}<span>${esc(c)}</span></div>`).join('')}</div>` : '';
    answerHtml = `<div class="reveal" ${r.revealed ? 'style="--x:0"' : ''}>
      <p class="headline">${esc(a.headline)}</p>
      ${sections}${drafts}${caveats}
    </div>`;
  }

  const error = r.error
    ? `<div class="error-card">${icon('alert')}<div><strong>${esc(r.error.message)}</strong>${esc(r.error.hint ?? '')}</div></div>`
    : '';
  const traceOpen = r.running || r.traceOpen;
  const trace = r.steps.length
    ? `<details class="trace" ${traceOpen ? 'open' : ''}>
        <summary>${icon('chevronRight')}How Weave got this · ${r.steps.length} MCP ${r.steps.length === 1 ? 'call' : 'calls'}${r.steps.some((s) => s.kind === 'write') ? `, ${r.steps.filter((s) => s.kind === 'write').length} held for approval` : ''}</summary>
        <ol class="steps">${r.steps.map(stepRow).join('')}</ol>
      </details>`
    : '';

  el.innerHTML = `<h2 class="q-title">${esc(r.question)}</h2><div class="meta">${meta}</div>${error}${answerHtml}${trace}`;
  r.steps.forEach((s) => (s.isNew = false));
  const reveal = $('.reveal', el);
  if (reveal && r.revealed) reveal.classList.remove('reveal');
  if (reveal) r.revealed = true;
  $('.trace', el)?.addEventListener('toggle', (e) => {
    // Ignore the toggle a replaced element fires after a re-render; only keep the person's own clicks.
    if (!r.running && e.target.isConnected) r.traceOpen = e.target.open;
  });
}

// ---------- sources & activity ----------
function sourceCard(s) {
  const r = s.record;
  const kind = { event: 'Event', note: 'Note', task: 'Task', transaction: 'Purchase', summary: 'Summary' }[r.kind] ?? r.kind;
  let when = '';
  let title = r.title ?? '';
  let lines = '';
  let body = '';
  if (r.kind === 'event') {
    when = cap(relDay(r.date));
    lines = `<div class="src-line">${fmtRange(r.start, r.end)}${r.location ? ` · ${esc(r.location)}` : ''}</div>${r.attendees?.length ? `<div class="src-line">With ${esc(r.attendees.join(', '))}</div>` : ''}`;
  } else if (r.kind === 'note') {
    when = `Edited ${relDay(r.updated)}`;
    if (r.action_items?.length) {
      body = `<ul class="src-body">${r.action_items
        .map((it) => `<li class="${it.done ? 'done' : ''} ${it.owner === 'me' ? 'mine' : ''}"><span class="box"></span><span><span class="owner">@${esc(it.owner)}</span> ${esc(it.text)}</span></li>`)
        .join('')}</ul>`;
    } else if (r.body) {
      const ls = r.body.split('\n').filter((l) => l.trim()).slice(0, 4);
      body = `<ul class="src-body">${ls.map((l) => `<li><span>${esc(l.replace(/^- /, ''))}</span></li>`).join('')}</ul>`;
    } else if (r.snippet) {
      lines = `<div class="src-line">${esc(r.snippet)}</div>`;
    }
  } else if (r.kind === 'task') {
    when = r.due ? `Due ${relDay(r.due)}` : 'No due date';
    lines = `<div class="src-line">${esc(r.list)} list · ${r.status === 'done' ? 'Done' : 'Open'}</div>`;
  } else if (r.kind === 'transaction') {
    when = cap(relDay(r.date));
    title = r.merchant;
    lines = `<div class="src-line" style="display:flex">${esc(r.category)}<span class="src-amount">${money(r.amount)}</span></div>`;
  } else if (r.kind === 'summary') {
    lines = `<div class="src-line" style="display:flex">${r.count} purchases<span class="src-amount">${money(r.total)}</span></div>`;
  }
  return `<article class="src" data-src="${esc(s.source_id)}">
    <div class="src-head">${s.n ? `<span class="n">${s.n}</span>` : ''}<span class="kind">${esc(s.app)} · ${esc(kind)}</span><span class="when">${esc(when)}</span></div>
    <div class="src-title">${esc(title)}</div>${lines}${body}
  </article>`;
}

function renderSources() {
  const el = $('#sources');
  const r = state.run;
  const a = r?.answer;
  const cited = a?.sources.filter((s) => s.n) ?? [];
  const other = a?.sources.filter((s) => !s.n) ?? [];
  $('#sourcesCount').textContent = a ? String(cited.length) : '';
  if (!r) {
    el.innerHTML = `<div class="panel-empty"><span class="big">Sources show up here.</span>Every point Weave makes links to the exact event, note, task or purchase it came from, so you can check it.</div>`;
    return;
  }
  if (!a) {
    el.innerHTML = `<div class="panel-empty"><span class="big">${r.running ? 'Gathering sources…' : 'No sources.'}</span>${r.running ? 'Weave is reading only what this question needs.' : ''}</div>`;
    return;
  }
  el.innerHTML = `<div class="${r.sourcesShown ? '' : 'fresh'}">
    <div class="group-label"><span class="label">Cited in this answer</span></div>
    ${cited.map(sourceCard).join('') || '<div class="panel-empty">Nothing cited.</div>'}
    ${other.length ? `<details class="uncited"><summary><span class="label">Read but not cited · ${other.length}</span>${icon('chevronDown')}</summary>${other.map(sourceCard).join('')}</details>` : ''}
  </div>`;
  r.sourcesShown = true;
}

async function refreshActivity() {
  try {
    state.activity = (await api('/api/activity')).activity;
  } catch {
    /* ignore */
  }
  renderActivity();
}

function renderActivity() {
  const el = $('#activity');
  const items = [...state.activity].reverse();
  $('#activityCount').textContent = items.length ? String(items.length) : '';
  const time = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  el.innerHTML = `<p class="log-note">Every message between Weave (the MCP client) and each app's MCP server, newest first.</p>
    <ul class="log">${items
      .map(
        (x) => `<li class="${x.write ? 'write' : ''} ${x.method === 'held' ? 'held' : ''} ${x.isError ? 'err' : ''}">
          <span class="t">${time(x.at)}</span>
          <span class="what"><span class="srv">${esc(x.server)}</span> <span class="m">${esc(x.method)}</span> ${x.tool ? `<span class="tool">${esc(x.tool)}</span>` : ''}</span>
          <span class="sub">${esc([compactArgs(x.args), x.summary].filter(Boolean).join(' → '))}${x.method === 'tools/call' || x.method === 'tools/list' ? ` · ${x.ms} ms` : ''}</span>
        </li>`,
      )
      .join('')}</ul>`;
}

function setTab(tab) {
  state.tab = tab;
  $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
  $('#sources').hidden = tab !== 'sources';
  $('#activity').hidden = tab !== 'activity';
}

function renderAll() {
  renderTopbar();
  renderRail();
  renderIntro();
  renderResult();
  renderSources();
  renderActivity();
}

// ---------- asking ----------
async function ask(question) {
  const q = question.trim();
  if (!q || state.run?.running) return;
  state.editing = null;
  state.run = { question: q, mode: state.status.mode, model: state.status.planners.claude.model, steps: [], answer: null, error: null, running: true, revealed: false, traceOpen: false };
  $('#q').value = '';
  autosize();
  setBusy(true);
  renderResult();
  renderSources();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const run = state.run;
  try {
    const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q }) });
    if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut;
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const event = chunk.match(/^event: (.+)$/m)?.[1];
        const data = JSON.parse(chunk.match(/^data: (.+)$/m)?.[1] ?? 'null');
        onEvent(run, event, data);
      }
    }
  } catch (err) {
    run.error = { message: err.message, hint: '' };
  }
  run.running = false;
  setBusy(false);
  if (state.run === run) {
    renderResult();
    renderSources();
    refreshActivity();
  }
}

function onEvent(run, event, data) {
  if (state.run !== run) return;
  if (event === 'run') Object.assign(run, { mode: data.mode, model: data.model ?? run.model });
  if (event === 'step') {
    const i = run.steps.findIndex((s) => s.id === data.id);
    if (i >= 0) run.steps[i] = data;
    else run.steps.push({ ...data, isNew: true });
  }
  if (event === 'answer') run.answer = data;
  if (event === 'error') run.error = data;
  if (event === 'done') run.ms = data.ms;
  if (event === 'answer' || event === 'step' || event === 'error') renderResult();
}

function setBusy(busy) {
  $('#askBtn').disabled = busy;
  $('#q').placeholder = busy ? 'Working on it…' : state.run ? 'Ask another question…' : 'Ask about your day, your plans or your spending…';
}

function autosize() {
  const t = $('#q');
  t.style.height = 'auto';
  t.style.height = `${Math.min(t.scrollHeight, 180)}px`;
}

// ---------- drafts ----------
function findProposal(id) {
  return state.run?.answer?.proposals.find((p) => p.id === id);
}

async function decide(id, action, changes) {
  const p = findProposal(id);
  if (!p) return;
  state.busy.add(id);
  renderResult();
  try {
    const { proposal, error } = await api(`/api/proposals/${id}/${action}`, action === 'approve' ? { changes } : {});
    if (proposal) Object.assign(p, proposal);
    if (error) toast(error);
    else if (action === 'approve') toast(p.status === 'done' ? `Added to ${p.app}.` : `${p.app} didn't confirm this change.`);
  } catch (err) {
    toast(err.message);
  }
  state.busy.delete(id);
  state.editing = null;
  renderResult();
  refreshActivity();
}

// ---------- highlight links between answer and sources ----------
function highlight(sourceId, on, scroll) {
  $$(`[data-src="${CSS.escape(sourceId)}"]`).forEach((el) => el.classList.toggle('hot', on));
  if (on && scroll) {
    const card = $(`.src[data-src="${CSS.escape(sourceId)}"]`);
    if (card) {
      card.closest('details')?.setAttribute('open', '');
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}

// ---------- events ----------
function bind() {
  $('#composer').addEventListener('submit', (e) => {
    e.preventDefault();
    ask($('#q').value);
  });
  $('#q').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      ask($('#q').value);
    }
  });
  $('#q').addEventListener('input', autosize);
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $('#q').focus();
    }
    if (e.key === 'Escape' && state.editing) {
      state.editing = null;
      renderResult();
    }
  });

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('button, [data-action]');
    if (!el) return;
    if (el.matches('.suggestion')) return ask(el.dataset.q);
    if (el.matches('.cite')) {
      setTab('sources');
      highlight(el.dataset.src, true, true);
      const card = $(`.src[data-src="${CSS.escape(el.dataset.src)}"]`);
      card?.classList.remove('flash');
      void card?.offsetWidth;
      card?.classList.add('flash');
      return;
    }
    if (el.matches('.tab')) return setTab(el.dataset.tab);
    if (el.dataset.mode && !el.disabled) {
      state.status = await api('/api/mode', { mode: el.dataset.mode });
      renderTopbar();
      return toast(el.dataset.mode === 'claude' ? 'Claude will choose which MCP tools to call.' : 'Offline script: same MCP calls, fixed plan, two demo questions.');
    }
    if (el.id === 'reset') {
      el.disabled = true;
      state.status = await api('/api/reset', {});
      state.run = null;
      el.disabled = false;
      renderAll();
      refreshActivity();
      return toast('Demo reset: sample apps restarted with fresh data.');
    }
    const action = el.dataset.action;
    const appId = el.closest('[data-app]')?.dataset.app;
    if (action === 'expand' && appId) {
      state.open.has(appId) ? state.open.delete(appId) : state.open.add(appId);
      return renderRail();
    }
    if (action === 'toggle' && appId) {
      const on = el.getAttribute('aria-checked') !== 'true';
      state.status = await api(`/api/apps/${appId}`, { enabled: on });
      renderRail();
      const name = state.status.apps.find((a) => a.id === appId)?.name;
      return toast(on ? `${name} is on.` : `${name} is off. Weave won't read or change it.`);
    }
    if (action === 'clear') {
      state.run = null;
      renderResult();
      renderSources();
      setBusy(false);
      return $('#q').focus();
    }
    const pid = el.closest('[data-proposal]')?.dataset.proposal;
    if (!pid) return;
    if (action === 'approve') return decide(pid, 'approve', {});
    if (action === 'dismiss') return decide(pid, 'dismiss');
    if (action === 'edit') {
      state.editing = pid;
      renderResult();
      return $(`[data-proposal="${CSS.escape(pid)}"] input`)?.focus();
    }
    if (action === 'cancel-edit') {
      state.editing = null;
      return renderResult();
    }
    if (action === 'approve-edited') {
      const card = el.closest('[data-proposal]');
      const changes = Object.fromEntries($$('input', card).map((i) => [i.name, i.value]));
      return decide(pid, 'approve', changes);
    }
  });

  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('.cite, .src');
    if (t) highlight(t.dataset.src, true, t.matches('.cite') && state.tab === 'sources');
  });
  document.addEventListener('mouseout', (e) => {
    const t = e.target.closest('.cite, .src');
    if (t) highlight(t.dataset.src, false);
  });
}

async function init() {
  $$('[data-icon]').forEach((el) => (el.innerHTML = icons[el.dataset.icon] ?? ''));
  try {
    state.status = await api('/api/status');
  } catch (err) {
    document.body.innerHTML = `<p style="padding:40px;font:16px/1.5 sans-serif">Couldn't reach the Weave server: ${esc(err.message)}</p>`;
    return;
  }
  renderAll();
  bind();
  refreshActivity();
  $('#q').focus();
}

init();
