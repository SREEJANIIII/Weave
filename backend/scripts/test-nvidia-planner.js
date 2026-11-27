import assert from 'node:assert/strict';
import { BASE_URL, MODEL, explainError, runNvidia } from '../src/agent-nvidia.js';

const tool = { name: 'list_events', description: 'List events', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } };
const writes = { name: 'create_task', description: 'Create task', inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] }, annotations: { readOnlyHint: false } };
const calls = [
  { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_read', type: 'function', function: { name: 'calendar__list_events', arguments: '{}' } }] } }] },
  { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_write', type: 'function', function: { name: 'tasks__create_task', arguments: JSON.stringify({ title: 'Follow up', why: 'It is due soon.', source_ids: ['calendar:evt_1'] }) } }] } }] },
  { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_answer', type: 'function', function: { name: 'present_answer', arguments: JSON.stringify({ headline: 'One event found.', sections: [{ title: 'Today', items: [{ text: 'Follow up.', detail: '', source_ids: ['calendar:evt_1'] }] }], caveats: [] }) } }] } }] },
];
const fakeClient = { chat: { completions: { create: async () => calls.shift() } } };
const proposals = [];
const run = {
  question: 'What should I follow up on?',
  hub: { availableTools: () => [{ server: 'calendar', app: 'Calendar', tool }, { server: 'tasks', app: 'Tasks', tool: writes }] },
  read: async () => ({ ok: true, data: { events: [{ id: 'evt_1', kind: 'event', title: 'Review', date: '2026-11-27' }] } }),
  propose: (server, name, args, meta) => { const p = { id: 'draft_1', server, tool: name, args, meta }; proposals.push(p); return p; },
  finish: (answer) => answer,
};
const answer = await runNvidia(run, { client: fakeClient });
assert.equal(answer.headline, 'One event found.');
assert.equal(proposals.length, 1);
assert.equal(proposals[0].tool, 'create_task');
assert.equal(proposals[0].args.title, 'Follow up');
assert.equal(BASE_URL, 'https://integrate.api.nvidia.com/v1');
assert.equal(MODEL, process.env.NVIDIA_MODEL || process.env.WEAVE_MODEL || 'openai/gpt-oss-20b');
const originalKey = process.env.NVIDIA_API_KEY;
process.env.NVIDIA_API_KEY = 'test-only-not-a-real-key';
assert.match(explainError(Object.assign(new Error('request timed out'), { code: 'ETIMEDOUT' })).message, /reach NVIDIA/i);
assert.match(explainError(Object.assign(new Error('401 invalid api key'), { status: 401 })).message, /authenticate/i);
assert.match(explainError(new Error('404 model not found')).hint, /NVIDIA_MODEL/);
if (originalKey === undefined) delete process.env.NVIDIA_API_KEY; else process.env.NVIDIA_API_KEY = originalKey;
console.log('  ✓ NVIDIA function calling, write drafting, malformed/error mapping, and endpoint configuration checks passed');
