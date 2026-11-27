// NVIDIA NIM planner through its OpenAI-compatible hosted API. MCP reads execute
// through Run.read; writes become approval-gated Run.propose drafts.
import OpenAI from 'openai';
import { isReadOnly } from './hub.js';
import { now, isoDate, fmtLongDate, pad } from '../lib/dates.js';

export const BASE_URL = 'https://integrate.api.nvidia.com/v1';
// The model comes from backend/.env: NVIDIA_MODEL, or WEAVE_MODEL, or this default.
export const MODEL = process.env.NVIDIA_MODEL || process.env.WEAVE_MODEL || 'openai/gpt-oss-20b';
export function hasCredentials() { return Boolean(process.env.NVIDIA_API_KEY); }
export function createNvidiaClient() { return new OpenAI({ apiKey: process.env.NVIDIA_API_KEY, baseURL: BASE_URL, timeout: 30_000, maxRetries: 1 }); }

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    sections: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, detail: { type: 'string' }, source_ids: { type: 'array', items: { type: 'string' } } }, required: ['text', 'detail', 'source_ids'], additionalProperties: false } } }, required: ['title', 'items'], additionalProperties: false } },
    caveats: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'sections', 'caveats'], additionalProperties: false,
};

function systemPrompt(apps) {
  const T = now();
  return `You are Weave, an assistant that helps one person with everyday life by reading connected apps through MCP tools.

Today is ${fmtLongDate(T)} ${T.getFullYear()} (${isoDate(T)}). Local time is ${pad(T.getHours())}:${pad(T.getMinutes())}. Tools use YYYY-MM-DD and 24-hour times.
Connected apps: ${apps.join(', ')}. Nothing else is connected.

How to work:
- Read only what the question needs. Prefer narrow calls.
- For saved-product and occasion questions, use Wishlist & sizes plus Calendar when connected. Match event occasion tags/titles to wishlist occasion tags and use requested 30/14/7-day windows; never invent festival dates.
- For size questions, call match_product_size or get_brand_size_chart. Results are deterministic synthetic-data recommendations, never fit guarantees. Do not call get_size_profile unless explicitly asked; measurements are sensitive.
- For appliance questions use Appliances & Bills: search_appliances, get_appliance, get_appliance_documents, get_upcoming_deadlines and list_appliance_reminders. Answer with dates actually documented, never invent one. "Soon" means the next 30 days unless the user says otherwise. Write tools such as update_appliance_deadline, create_appliance_reminder, update_appliance_reminder and update_appliance only draft changes for approval; dismissed/completed reminders stay that way.
- Every record returned by a tool has a source_id. Cite only source_ids from records actually read.
- Writes never execute from a tool call: they create drafts for approval. Check for duplicates first and never claim a draft is done.
- If an app is unavailable or a tool fails, say what you could not check instead of guessing.
- When relating spending to calendar events, present the calendar as context, never as the cause.

Finish by calling present_answer exactly once after any drafts. Keep it short and specific. Drafted changes are shown separately.`;
}

function schemaFor(tool) {
  const { $schema, ...schema } = tool.inputSchema ?? { type: 'object', properties: {} };
  return { type: 'object', properties: {}, ...schema };
}

function buildTools(run) {
  const byName = new Map();
  const tools = run.hub.availableTools().map(({ server, app, tool }) => {
    const name = `${server}__${tool.name}`;
    const readOnly = isReadOnly(tool);
    const parameters = schemaFor(tool);
    const required = parameters.required ?? [];
    if (!readOnly) {
      parameters.properties = { ...parameters.properties, why: { type: 'string', description: 'One short sentence explaining why this change helps.' }, source_ids: { type: 'array', items: { type: 'string' }, description: 'Cited source_ids supporting this change.' } };
      parameters.required = [...required, 'why'];
    }
    const entry = { server, tool, readOnly, required };
    byName.set(name, entry);
    return { type: 'function', function: { name, description: `[${app}] ${tool.description ?? tool.title ?? tool.name}${readOnly ? '' : ' Calling this drafts a change for approval; it does not execute it.'}`, parameters } };
  });
  tools.push({ type: 'function', function: { name: 'present_answer', description: 'Show the final answer. Call exactly once as the last step.', parameters: ANSWER_SCHEMA } });
  return { tools, byName };
}

async function executeTool(run, entry, input) {
  if (entry.readOnly) {
    const result = await run.read(entry.server, entry.tool.name, input ?? {});
    return result.ok ? JSON.stringify(result.data) : JSON.stringify({ error: result.error });
  }
  const { why = '', source_ids = [], ...args } = input ?? {};
  const missing = entry.required.filter((key) => args[key] === undefined || args[key] === '');
  if (missing.length) return JSON.stringify({ error: `Missing required field(s): ${missing.join(', ')}.` });
  const proposal = run.propose(entry.server, entry.tool.name, args, { why, sourceIds: Array.isArray(source_ids) ? source_ids : [] });
  return `Drafted for approval (draft ${proposal.id}); it has NOT been executed.`;
}

function parseAnswer(text) {
  if (!text) return null;
  try { return JSON.parse(text.replace(/^```json\s*|\s*```$/g, '').trim()); } catch { return null; }
}

export async function runNvidia(run, { client = createNvidiaClient() } = {}) {
  const apps = [...new Set(run.hub.availableTools().map((tool) => tool.app))];
  const { tools, byName } = buildTools(run);
  const messages = [{ role: 'system', content: systemPrompt(apps) }, { role: 'user', content: run.question }];
  let lastMessage = null;

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const completion = await client.chat.completions.create({ model: MODEL, messages, tools, tool_choice: 'auto', temperature: 0.2, max_tokens: 16000 });
    lastMessage = completion.choices?.[0]?.message;
    if (!lastMessage) break;
    const calls = lastMessage.tool_calls ?? [];
    if (!calls.length) { run.draftAnswer = parseAnswer(lastMessage.content) ?? { headline: lastMessage.content || "I couldn't finish this answer.", sections: [], caveats: ['The NVIDIA planner stopped before giving a structured answer.'] }; break; }
    messages.push(lastMessage);
    let presented = false;
    for (const call of calls) {
      const name = call.function?.name;
      let input = {};
      try { input = JSON.parse(call.function?.arguments || '{}'); } catch { input = null; }
      if (name === 'present_answer') { run.draftAnswer = input ?? {}; presented = true; messages.push({ role: 'tool', tool_call_id: call.id, content: 'Answer captured.' }); continue; }
      const entry = byName.get(name);
      const result = !input ? JSON.stringify({ error: 'Malformed JSON tool arguments.' }) : entry ? await executeTool(run, entry, input) : JSON.stringify({ error: `Unknown tool ${name}.` });
      messages.push({ role: 'tool', tool_call_id: call.id, content: result });
    }
    if (presented) break;
  }
  if (!run.draftAnswer) run.draftAnswer = { headline: lastMessage?.content || "I couldn't finish this answer.", sections: [], caveats: ['The NVIDIA planner stopped before giving a structured answer.'] };
  return run.finish(run.draftAnswer);
}

export function explainError(err) {
  if (!hasCredentials()) return { message: 'No NVIDIA credentials found.', hint: 'Set NVIDIA_API_KEY and restart, or switch the planner to Offline.' };
  const message = String(err?.message ?? 'Something went wrong.');
  if (/401|403|api key|authentication|permission/i.test(message)) return { message: "NVIDIA couldn't authenticate.", hint: 'Check NVIDIA_API_KEY and restart.' };
  if (/404|model/i.test(message)) return { message: `NVIDIA model ${MODEL} was not found or is unavailable.`, hint: 'Set WEAVE_MODEL (or NVIDIA_MODEL) in backend/.env to a model available in the NVIDIA API catalog.' };
  if (/429|rate/i.test(message)) return { message: 'NVIDIA is rate-limited right now.', hint: 'Wait a moment and ask again.' };
  if (/timeout|timed out|ETIMEDOUT|network|connect|fetch/i.test(message)) return { message: "Couldn't reach NVIDIA's API.", hint: 'Check your connection, or switch the planner to Offline.' };
  return { message: `NVIDIA API error${err?.status ? ` (${err.status})` : ''}.`, hint: message };
}
