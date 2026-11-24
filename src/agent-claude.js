// Claude planner: Claude decides which MCP tools to call, using the Anthropic SDK's tool runner.
// Read-only tools run straight away through MCP. Tools that change data never run here: calling one
// only drafts a proposal that the user approves or dismisses in the UI.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { ToolError } from '@anthropic-ai/sdk/lib/tools/ToolError';
import { isReadOnly } from './hub.js';
import { now, isoDate, fmtLongDate, pad } from '../lib/dates.js';

export const MODEL = process.env.WEAVE_MODEL || 'claude-opus-5-5';
export const EFFORT = process.env.WEAVE_EFFORT || 'medium';

/** Whether the SDK is likely to find credentials (an API key, an auth token, or an `ant auth login` profile). */
export function hasCredentials() {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE) return true;
  return fs.existsSync(path.join(os.homedir(), '.config', 'anthropic'));
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
                source_ids: { type: 'array', items: { type: 'string' }, description: 'source_id values of the records this point rests on.' },
              },
              required: ['text', 'detail', 'source_ids'],
              additionalProperties: false,
            },
          },
        },
        required: ['title', 'items'],
        additionalProperties: false,
      },
    },
    caveats: { type: 'array', items: { type: 'string' }, description: 'Limits the user should know about. Empty if none.' },
  },
  required: ['headline', 'sections', 'caveats'],
  additionalProperties: false,
};

function systemPrompt(apps) {
  const T = now();
  return `You are Weave, an assistant that helps one person with everyday life by reading their connected apps through MCP tools.

Today is ${fmtLongDate(T)} ${T.getFullYear()} (${isoDate(T)}). The local time is ${pad(T.getHours())}:${pad(T.getMinutes())}. Tools use YYYY-MM-DD dates and 24-hour times.
Connected apps: ${apps.join(', ')}. Nothing else (email, fitness apps, travel, bank accounts) is connected.

How to work:
- Read only what the question needs. Prefer narrow calls, such as today's events, open tasks or recent meeting notes.
- Every record a tool returns has a source_id. List the source_ids each point rests on, and never cite a record you didn't read.
- Tools that change data (such as create_task and create_event) never run when you call them: each call drafts a change that the user approves or dismisses. Draft a change only when it clearly helps, check first that it doesn't already exist, explain why in one sentence, and never say it has been done.
- If an app you'd need isn't connected, or a tool fails, say what you couldn't check instead of guessing.
- When you relate spending to calendar events, present the calendar as context, never as the cause.
- Summarise the user's own records and plans; don't give medical or financial advice.

Finish by calling present_answer once, after any drafts. Keep it short and specific: a one-sentence headline, then a few points. Write times like "6:15–7:00 pm". The drafted changes are shown to the user separately, so mention them briefly at most.`;
}

function clientSchema(schema) {
  const { $schema, ...rest } = schema ?? {};
  return { type: 'object', properties: {}, ...rest };
}

/** Build the runnable tools for this run: one per MCP tool, plus present_answer. */
function buildTools(run) {
  const byName = new Map();
  const tools = run.hub.availableTools().map(({ server, app, tool }) => {
    const name = `${server}__${tool.name}`;
    const readOnly = isReadOnly(tool);
    const schema = clientSchema(tool.inputSchema);
    const required = schema.required ?? [];
    if (!readOnly) {
      schema.properties = {
        ...schema.properties,
        why: { type: 'string', description: 'One short sentence for the user: why this change helps.' },
        source_ids: { type: 'array', items: { type: 'string' }, description: 'source_ids of the records this change is based on.' },
      };
      schema.required = [...required, 'why'];
    }
    const entry = { server, tool, readOnly, required };
    byName.set(name, entry);
    return betaTool({
      name,
      description: `[${app}] ${tool.description ?? tool.title ?? tool.name}${readOnly ? '' : ' Calling this only drafts the change for the user to approve; it does not run.'}`,
      inputSchema: schema,
      run: async (input) => (readOnly ? readTool(run, entry, input) : draftTool(run, entry, input)),
    });
  });
  tools.push(
    betaTool({
      name: 'present_answer',
      description: 'Show the final answer to the user. Call this exactly once, as your last step.',
      inputSchema: ANSWER_SCHEMA,
      strict: true,
      run: async (input) => {
        run.draftAnswer = input;
        return 'Shown to the user.';
      },
    }),
  );
  return { tools, byName };
}

async function readTool(run, { server, tool }, input) {
  const res = await run.read(server, tool.name, input ?? {});
  if (!res.ok) throw new ToolError(res.error);
  return JSON.stringify(res.data);
}

function draftTool(run, { server, tool, required }, input = {}) {
  const { why = '', source_ids = [], ...args } = input;
  const missing = required.filter((k) => args[k] === undefined || args[k] === '');
  if (missing.length) throw new ToolError(`Missing required field(s): ${missing.join(', ')}.`);
  const p = run.propose(server, tool.name, args, { why, sourceIds: Array.isArray(source_ids) ? source_ids : [] });
  return `Drafted for the user's approval (draft ${p.id}). It has NOT been executed; don't describe it as done.`;
}

export async function runClaude(run) {
  const apps = [...new Set(run.hub.availableTools().map((t) => t.app))];
  const { tools, byName } = buildTools(run);
  const client = new Anthropic();
  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: EFFORT },
    cache_control: { type: 'ephemeral' },
    system: systemPrompt(apps),
    tools,
    messages: [{ role: 'user', content: run.question }],
    max_iterations: 12,
  });

  let last = null;
  for await (const message of runner) {
    last = message;
    if (message.stop_reason === 'refusal') break;
    // Each reply is yielded before its tools run. Once Claude presents its answer we stop here, after
    // drafting any changes that came in the same reply, instead of making one more request.
    const final = message.content.find((b) => b.type === 'tool_use' && b.name === 'present_answer');
    if (final) {
      for (const block of message.content) {
        const entry = block.type === 'tool_use' ? byName.get(block.name) : null;
        if (entry && !entry.readOnly) {
          try {
            draftTool(run, entry, block.input);
          } catch {
            /* an invalid draft in the final reply is skipped */
          }
        }
      }
      run.draftAnswer = final.input;
      break;
    }
  }

  if (last?.stop_reason === 'refusal') {
    const why = last.stop_details?.explanation;
    throw Object.assign(new Error(`Claude declined this request${why ? `: ${why}` : '.'}`), { hint: 'Try rephrasing the question.' });
  }
  if (!run.draftAnswer) {
    const text = (last?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    run.draftAnswer = {
      headline: text || "I couldn't finish this answer.",
      sections: [],
      caveats: ['The planner stopped before giving a structured answer.'],
    };
  }
  return run.finish(run.draftAnswer);
}

/** Turn SDK errors into something a person can act on. */
export function explainError(err) {
  if (!hasCredentials() && !(err instanceof Anthropic.APIError)) {
    return { message: 'No Anthropic credentials found.', hint: 'Set ANTHROPIC_API_KEY and restart the server, or switch the planner to Offline.' };
  }
  if (err instanceof Anthropic.AuthenticationError) return { message: "Claude couldn't sign in.", hint: 'Set ANTHROPIC_API_KEY and restart, or switch the planner to Offline.' };
  if (err instanceof Anthropic.PermissionDeniedError) return { message: `This key can't use ${MODEL}.`, hint: 'Check the key, or set WEAVE_MODEL.' };
  if (err instanceof Anthropic.NotFoundError) return { message: `Model ${MODEL} wasn't found for this key.`, hint: 'Set WEAVE_MODEL to a model your key can use.' };
  if (err instanceof Anthropic.RateLimitError) return { message: 'Claude is rate-limited right now.', hint: 'Wait a moment and ask again.' };
  if (err instanceof Anthropic.APIConnectionError) return { message: "Couldn't reach the Claude API.", hint: 'Check your connection, or switch the planner to Offline.' };
  if (err instanceof Anthropic.APIError) return { message: `Claude API error${err.status ? ` (${err.status})` : ''}.`, hint: err.message };
  return { message: err?.message ?? 'Something went wrong.', hint: err?.hint ?? '' };
}
