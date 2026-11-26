// NVIDIA NIM planner: OpenAI-compatible chat completions + MCP tool calling.
// Read-only tools run straight away through MCP. Tools that change data never run here: calling
// one only drafts a proposal that the user approves or dismisses in the UI.
import { isReadOnly } from './hub.js';
import { now, isoDate, fmtLongDate, pad } from '../lib/dates.js';

export const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
export const BASE_URL = (process.env.NVIDIA_NIM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
export const MODEL = process.env.WEAVE_MODEL || 'nvidia/nemotron-3.5-super-vl-120b-a12b';

export function getApiKey() {
  return String(process.env.NVIDIA_API_KEY || process.env.NVIDIA_NIM_API_KEY || '').trim();
}

/** Whether an NVIDIA NIM API key is configured. */
export function hasCredentials() {
  return Boolean(getApiKey());
}

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'One sentence that answers the question directly.' },
    sections: {
      type: 'array',
      description: 'Up to three short groups of points, e.g. "Follow up today" and "Workout".',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'The point, as one short sentence.' },
                detail: { type: 'string', description: 'Supporting context in one sentence, or an empty string.' },
                source_ids: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'source_id values of the records this point rests on.',
                },
              },
              required: ['text', 'detail', 'source_ids'],
            },
          },
        },
        required: ['title', 'items'],
      },
    },
    caveats: {
      type: 'array',
      items: { type: 'string' },
      description: 'Limits the user should know about. Empty array if none.',
    },
  },
  required: ['headline', 'sections', 'caveats'],
};

function systemPrompt(apps) {
  const T = now();
  return `You are Weave, an assistant that helps one person with everyday life by reading their connected apps through MCP tools.

Today is ${fmtLongDate(T)} ${T.getFullYear()} (${isoDate(T)}). The local time is ${pad(T.getHours())}:${pad(T.getMinutes())}. Tools use YYYY-MM-DD dates and 24-hour times.
Connected apps: ${apps.join(', ')}. Nothing else (email, fitness apps, travel, bank accounts) is connected.

How to work:
- Read only what the question needs. Prefer narrow calls, such as today's events, open tasks or recent meeting notes.
- For saved-product and occasion questions, use Wishlist & sizes plus Calendar when connected. Match an event's occasion tag/title to wishlist occasion tags and use the requested 30/14/7-day window; never invent festival dates.
- For size questions, call match_product_size (or get_brand_size_chart when explicitly asked). It is deterministic and synthetic sample data; describe results as measurement-based recommendations, never guarantees. Do not call get_size_profile unless the user explicitly asks to inspect it; measurements are sensitive.
- Every record a tool returns has a source_id. List the source_ids each point rests on, and never cite a record you didn't read.
- Tools that change data (such as create_task, create_event, save_wishlist_item, update_size_profile, and reconcile_reminders) never run when you call them: each call drafts a change that the user approves or dismisses. Draft a change only when it clearly helps, check first that it doesn't already exist, explain why in one sentence, and never say it has been done.
- If an app you'd need isn't connected, or a tool fails, say what you couldn't check instead of guessing.
- When you relate spending to calendar events, present the calendar as context, never as the cause.
- Summarise the user's own records and plans; don't give medical or financial advice.

Finish by calling present_answer once, after any drafts. Keep it short and specific: a one-sentence headline, then a few points. Write times like "6:15–7:00 pm". The drafted changes are shown to the user separately, so mention them briefly at most.`;
}

/** Simplify Zod-generated JSON Schemas for broad NVIDIA NIM tool-calling compatibility. */
function sanitiseSchema(node) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(sanitiseSchema);
  if (Array.isArray(node.anyOf)) {
    const nonNull = node.anyOf.filter((x) => x?.type !== 'null');
    if (nonNull.length === 1) return sanitiseSchema(nonNull[0]);
    if (nonNull.length > 1 && nonNull.every((x) => x && 'const' in x)) {
      return { type: nonNull[0].type || typeof nonNull[0].const, enum: nonNull.map((x) => x.const) };
    }
  }
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === '$schema' || k === 'additionalProperties') continue;
    if (k === 'type' && Array.isArray(v)) {
      const first = v.find((t) => t !== 'null') || 'string';
      out[k] = first;
      continue;
    }
    out[k] = sanitiseSchema(v);
  }
  return out;
}

function clientSchema(schema) {
  const clean = sanitiseSchema(schema ?? {});
  return {
    type: 'object',
    properties: clean.properties ?? {},
    ...(clean.required?.length ? { required: clean.required } : {}),
  };
}

/** Build OpenAI-compatible NIM tools: one per connected MCP tool, plus present_answer. */
export function buildTools(run) {
  const byName = new Map();
  const tools = run.hub.availableTools().map(({ server, app, tool }) => {
    const name = `${server}__${tool.name}`;
    const readOnly = isReadOnly(tool);
    const parameters = clientSchema(tool.inputSchema);
    const required = parameters.required ?? [];
    if (!readOnly) {
      parameters.properties = {
        ...parameters.properties,
        why: { type: 'string', description: 'One short sentence for the user: why this change helps.' },
        source_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'source_ids of the records this change is based on.',
        },
      };
      parameters.required = [...required, 'why'];
    }
    byName.set(name, { server, tool, readOnly, required });
    return {
      type: 'function',
      function: {
        name,
        description: `[${app}] ${tool.description ?? tool.title ?? tool.name}${
          readOnly ? '' : ' Calling this only drafts the change for the user to approve; it does not run.'
        }`,
        parameters,
      },
    };
  });

  tools.push({
    type: 'function',
    function: {
      name: 'present_answer',
      description: 'Show the final answer to the user. Call this exactly once, as your last step.',
      parameters: ANSWER_SCHEMA,
    },
  });

  return { tools, byName };
}

async function readTool(run, { server, tool }, input) {
  const res = await run.read(server, tool.name, input ?? {});
  if (!res.ok) return JSON.stringify({ error: res.error });
  return JSON.stringify(res.data);
}

function draftTool(run, { server, tool, required }, input = {}) {
  const { why = '', source_ids = [], ...args } = input ?? {};
  const missing = required.filter((k) => args[k] === undefined || args[k] === '');
  if (missing.length) return JSON.stringify({ error: `Missing required field(s): ${missing.join(', ')}.` });
  const p = run.propose(server, tool.name, args, {
    why,
    sourceIds: Array.isArray(source_ids) ? source_ids : [],
  });
  return `Drafted for the user's approval (draft ${p.id}). It has NOT been executed; don't describe it as done.`;
}

function parseJsonObject(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  const text = String(raw).trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() || text;
  try {
    const parsed = JSON.parse(fenced);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export class NimApiError extends Error {
  constructor(status, message, body = null) {
    super(message);
    this.name = 'NimApiError';
    this.status = status;
    this.body = body;
  }
}

async function chatCompletion(messages, tools) {
  const apiKey = getApiKey();
  if (!apiKey) throw new NimApiError(401, 'No NVIDIA NIM API key found.');

  let res;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    throw Object.assign(new Error(err?.message || 'Network request to NVIDIA NIM failed.'), { isNetwork: true });
  }

  const rawText = await res.text();
  let jsonBody = null;
  try {
    jsonBody = rawText ? JSON.parse(rawText) : null;
  } catch {
    jsonBody = null;
  }

  if (!res.ok) {
    const detail = jsonBody?.detail || jsonBody?.error?.message || jsonBody?.title || rawText.slice(0, 240);
    throw new NimApiError(res.status, detail || `NVIDIA NIM returned HTTP ${res.status}`, jsonBody);
  }
  return jsonBody;
}

export async function runNim(run, { complete = chatCompletion } = {}) {
  const apps = [...new Set(run.hub.availableTools().map((t) => t.app))];
  const { tools, byName } = buildTools(run);
  const messages = [
    { role: 'system', content: systemPrompt(apps) },
    { role: 'user', content: run.question },
  ];

  let lastMessage = null;
  const maxIterations = 12;

  for (let i = 0; i < maxIterations; i += 1) {
    const completion = await complete(messages, tools);
    const msg = completion?.choices?.[0]?.message;
    if (!msg) break;
    lastMessage = msg;
    messages.push({
      role: 'assistant',
      content: msg.content ?? '',
      ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}),
    });

    const calls = msg.tool_calls ?? [];
    if (!calls.length) break;

    let finalCall = null;
    for (const tc of calls) {
      const fnName = tc?.function?.name;
      const args = parseJsonObject(tc?.function?.arguments) ?? {};
      if (fnName === 'present_answer') {
        finalCall = args;
        continue;
      }
      const entry = byName.get(fnName);
      let output;
      if (!entry) {
        output = JSON.stringify({ error: `Unknown tool: ${fnName}` });
      } else {
        output = entry.readOnly ? await readTool(run, entry, args) : draftTool(run, entry, args);
      }
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: typeof output === 'string' ? output : JSON.stringify(output),
      });
    }

    if (finalCall) {
      run.draftAnswer = {
        headline: finalCall.headline ?? '',
        sections: Array.isArray(finalCall.sections) ? finalCall.sections : [],
        caveats: Array.isArray(finalCall.caveats) ? finalCall.caveats : [],
      };
      break;
    }
  }

  if (!run.draftAnswer) {
    const content = String(lastMessage?.content ?? '').trim();
    const parsedJson = parseJsonObject(content);
    if (parsedJson && typeof parsedJson.headline === 'string') {
      run.draftAnswer = {
        headline: parsedJson.headline,
        sections: Array.isArray(parsedJson.sections) ? parsedJson.sections : [],
        caveats: Array.isArray(parsedJson.caveats) ? parsedJson.caveats : [],
      };
    } else {
      run.draftAnswer = {
        headline: content || "I couldn't finish this answer.",
        sections: [],
        caveats: ['The NVIDIA NIM planner stopped before calling present_answer.'],
      };
    }
  }

  return run.finish(run.draftAnswer);
}

/** Turn API errors into actionable messages for the UI. */
export function explainError(err) {
  if (!hasCredentials()) {
    return {
      message: 'No NVIDIA NIM API key found.',
      hint: 'Set NVIDIA_API_KEY in backend/.env and restart the server, or switch the planner to Offline.',
    };
  }
  if (err?.isNetwork) {
    return {
      message: "Couldn't reach the NVIDIA NIM API.",
      hint: 'Check your network connection and NVIDIA_NIM_BASE_URL, or switch the planner to Offline.',
    };
  }
  if (err instanceof NimApiError) {
    if (err.status === 401 || err.status === 403) {
      return {
        message: 'NVIDIA NIM rejected this API key.',
        hint: 'Check NVIDIA_API_KEY in backend/.env, or switch the planner to Offline.',
      };
    }
    if (err.status === 404 || err.status === 410) {
      return {
        message: err.status === 410 ? `Model ${MODEL} is retired on NVIDIA NIM.` : `Model ${MODEL} wasn't found on NVIDIA NIM.`,
        hint: 'Set WEAVE_MODEL in backend/.env to an active NIM model (for example nvidia/nemotron-3.5-super-vl-120b-a12b).',
      };
    }
    if (err.status === 429) {
      return {
        message: 'NVIDIA NIM is rate-limited right now.',
        hint: 'Wait a moment and ask again.',
      };
    }
    return {
      message: `NVIDIA NIM API error (${err.status}).`,
      hint: err.message,
    };
  }
  return { message: err?.message ?? 'Something went wrong.', hint: err?.hint ?? '' };
}

