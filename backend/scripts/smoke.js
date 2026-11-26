// End-to-end check of the prototype in offline mode: npm run smoke
// Starts the server on a spare port, asks both demo questions, approves and dismisses drafts,
// switches an app off, and resets. Exits non-zero if anything is wrong.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4399;
const base = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ['--env-file-if-exists=.env', 'src/server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT), WEAVE_MODE: 'offline' }, stdio: ['ignore', 'pipe', 'inherit'] });

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const r = await fetch(`${base}/api/status`);
      if (r.ok) return r.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start');
}

const post = (url, body = {}) => fetch(`${base}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

async function ask(question) {
  const res = await fetch(`${base}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
  const text = await res.text();
  const events = text.split('\n\n').filter(Boolean).map((chunk) => {
    const event = chunk.match(/^event: (.+)$/m)?.[1];
    const data = JSON.parse(chunk.match(/^data: (.+)$/m)?.[1] ?? 'null');
    return { event, data };
  });
  const answer = events.find((e) => e.event === 'answer')?.data;
  const error = events.find((e) => e.event === 'error')?.data;
  return { events, answer, error };
}

const ok = (label) => console.log(`  ✓ ${label}`);

try {
  const status = await waitForServer();
  assert.equal(status.apps.filter((a) => a.status === 'connected').length, 6, 'six MCP apps connected');
  const applianceApp = status.apps.find((a) => a.id === 'appliances');
  assert.equal(applianceApp?.name, 'Appliances & Bills', 'Appliances is registered in the MCP status payload');
  assert.ok(applianceApp?.tools.length > 0, 'Appliances tools are exposed to the Apps panel');
  const applianceOff = await post('/api/apps/appliances', { enabled: false });
  assert.equal(applianceOff.apps.find((a) => a.id === 'appliances')?.enabled, false, 'Appliances toggle disables the MCP server');
  const applianceOn = await post('/api/apps/appliances', { enabled: true });
  assert.equal(applianceOn.apps.find((a) => a.id === 'appliances')?.enabled, true, 'Appliances toggle re-enables the MCP server');
  assert.equal(status.apps.flatMap((a) => a.tools).length, 41, 'forty-one tools discovered');
  assert.deepEqual(status.apps.flatMap((a) => a.tools.filter((t) => !t.readOnly).map((t) => t.name)).sort(), ['confirm_appliance_document', 'create_appliance_reminder', 'create_event', 'create_task', 'delete_appliance_document', 'delete_size_profile', 'delete_wishlist_item', 'dismiss_reminder', 'reconcile_appliance_reminders', 'reconcile_reminders', 'save_appliance', 'save_wishlist_item', 'update_appliance', 'update_appliance_deadline', 'update_appliance_reminder', 'update_size_profile', 'update_wishlist_item']);
  ok('6 MCP servers connected, 41 tools, 17 marked as changing data');

  // Question 1
  const q1 = await ask(status.suggestions[0]);
  assert.ok(!q1.error, q1.error?.message);
  const a1 = q1.answer;
  assert.match(a1.headline, /follow-ups? today/i);
  assert.equal(a1.proposals.length, 2, 'two drafts');
  assert.ok(a1.proposals.every((p) => p.status === 'pending'));
  assert.ok(a1.sections.flatMap((s) => s.items).every((it) => it.sourceIds.length > 0), 'every point cites a source');
  const cited = new Set(a1.sections.flatMap((s) => s.items.flatMap((it) => it.sourceIds)));
  assert.ok([...cited].every((id) => a1.sources.some((s) => s.source_id === id && s.n)), 'citations resolve to numbered sources');
  assert.ok(q1.events.some((e) => e.event === 'step' && e.data.kind === 'write' && e.data.status === 'held'), 'writes are held, not run');
  ok(`Q1 answered: “${a1.headline}” (${a1.stats.reads} reads, ${a1.proposals.length} drafts held)`);

  // Nothing was written before approval
  const before = (await fetch(`${base}/api/activity`).then((r) => r.json())).activity;
  assert.ok(!before.some((x) => x.method === 'tools/call' && x.write), 'no write tool ran before approval');
  ok('no write tool was called before approval');

  // Approve the task with an edit, approve the run event, check read-back verification
  const task = a1.proposals.find((p) => p.tool === 'create_task');
  const event = a1.proposals.find((p) => p.tool === 'create_event');
  const t = await post(`/api/proposals/${task.id}/approve`, { changes: { title: 'Send the revised budget to design' } });
  assert.equal(t.proposal.status, 'done', t.proposal.error);
  assert.equal(t.proposal.result.title, 'Send the revised budget to design');
  const e = await post(`/api/proposals/${event.id}/approve`);
  assert.equal(e.proposal.status, 'done', e.proposal.error);
  ok(`approved: task ${t.proposal.result.id} and event ${e.proposal.result.id}, both read back from their apps`);
  const again = await post(`/api/proposals/${task.id}/approve`);
  assert.ok(again.error, 'a draft cannot be approved twice');
  ok('a draft cannot be approved twice');

  // Ask again: the new task now exists, so no duplicate is drafted
  const q1b = await ask(status.suggestions[0]);
  assert.ok(!q1b.answer.proposals.some((p) => p.tool === 'create_task'), 'no duplicate task drafted');
  ok('asking again does not draft a duplicate task');

  // Question 2
  const q2 = await ask(status.suggestions[1]);
  assert.ok(!q2.error, q2.error?.message);
  assert.match(q2.answer.headline, /spent ₹5,080 on food/);
  assert.ok(q2.answer.caveats.some((c) => /not why you spent/.test(c)));
  assert.equal(q2.answer.proposals.length, 0);
  ok(`Q2 answered: “${q2.answer.headline}”`);

  // Switch Tasks off: no task drafts, and the answer says what it could not check
  await post('/api/apps/tasks', { enabled: false });
  const q3 = await ask(status.suggestions[0]);
  assert.ok(!q3.answer.proposals.some((p) => p.server === 'tasks'));
  assert.ok(q3.answer.caveats.some((c) => /Tasks is switched off/.test(c)));
  ok('with Tasks off, nothing touches Tasks and the answer says so');
  await post('/api/apps/tasks', { enabled: true });

  // The run approved earlier is now on the calendar, so it isn't suggested again
  const q4 = await ask(status.suggestions[0]);
  const workout = q4.answer.sections.find((s) => s.title === 'Workout')?.items[0]?.text ?? '';
  assert.match(workout, /Already on your calendar/);
  assert.equal(q4.answer.proposals.length, 0);
  ok('after approval, the run shows as already booked');

  // Reset, then dismiss a draft
  const reset = await post('/api/reset');
  assert.equal(reset.apps.filter((a) => a.status === 'connected').length, 6);
  const q5 = await ask(status.suggestions[0]);
  assert.equal(q5.answer.proposals.length, 2, 'sample data back to the start');
  ok('reset restores the sample data');
  const dismissed = await post(`/api/proposals/${q5.answer.proposals[0].id}/dismiss`);
  assert.equal(dismissed.proposal.status, 'dismissed');
  const late = await post(`/api/proposals/${q5.answer.proposals[0].id}/approve`);
  assert.ok(late.error, 'a dismissed draft cannot be approved');
  ok('dismissing a draft works, and it cannot be approved afterwards');

  const wishlist = await ask('Show me my outfits saved for Diwali and suggest the size based on my measurements');
  assert.ok(!wishlist.error, wishlist.error?.message);
  assert.match(wishlist.answer.headline, /saved product|found/i);
  assert.ok(wishlist.answer.sections.some((s) => /size/i.test(s.title)), 'size recommendation section');
  assert.ok(wishlist.answer.sections.flatMap((s) => s.items).every((it) => it.sourceIds.length > 0), 'wishlist points cite records');
  const activity = (await fetch(`${base}/api/activity`).then((r) => r.json())).activity;
  assert.ok(activity.filter((x) => x.server === 'wishlist' && x.tool === 'match_product_size').every((x) => x.args?.redacted === true), 'size activity arguments are redacted');
  ok('wishlist occasion matching and deterministic size recommendation cite records without logging measurements');

  // Appliances & Bills: route guard, upload validation and cited offline Q&A.
  const applianceList = await fetch(`${base}/api/appliances`).then((r) => r.json());
  assert.ok(Array.isArray(applianceList.appliances), 'appliance list is reachable through the MCP server');
  const badUpload = new FormData();
  badUpload.append('file', new Blob(['not a bill'], { type: 'text/plain' }), 'note.txt');
  const uploadResponse = await fetch(`${base}/api/appliances/documents`, { method: 'POST', body: badUpload });
  assert.equal(uploadResponse.status, 400, 'unsupported upload types are rejected');
  const warranty = await ask('Which warranties expire soon?');
  assert.ok(!warranty.error, warranty.error?.message);
  assert.ok(warranty.answer.caveats.some((c) => /unconfirmed fields/i.test(c)), 'appliance answers say that unconfirmed fields are excluded');
  assert.ok(warranty.answer.sections.every((s) => s.items.every((it) => it.sourceIds.length > 0)), 'appliance points cite MCP records');
  ok('appliances MCP tools are reachable, uploads are validated, and appliance answers cite records');

  const unknown = await ask('What is the weather?');
  assert.match(unknown.answer.headline, /Offline mode/);
  ok('offline mode is honest about what it can answer');

  console.log('\n  All smoke checks passed.\n');
  server.kill('SIGINT');
  process.exit(0);
} catch (err) {
  console.error('\n  Smoke test failed:', err.message);
  server.kill('SIGINT');
  process.exit(1);
}
