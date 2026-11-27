// NVIDIA vision helper for appliance documents. Image input is verified before any
// image-bearing request is sent: catalog metadata is used when available, otherwise a
// tiny probe image is submitted. A model without image support produces a clear error,
// never a silent text-only substitute.
export const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
export const BASE_URL = (process.env.NVIDIA_NIM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
export const VISION_MODEL = process.env.NVIDIA_VISION_MODEL || process.env.NVIDIA_MODEL || process.env.WEAVE_MODEL || 'nvidia/nemotron-3.5-super-vl-120b-a12b';

// A small generated image with visible text. Blank/tiny images are rejected by the
// provider's media screening, so the probe must look like a genuine document image.
async function probeImageUrl() {
  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('OK', 28, 78);
  return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
}

const verified = new Map();

export class VisionUnsupportedError extends Error {
  constructor(model, detail = '') {
    super(`The configured NVIDIA model ${model} does not accept image input.${detail ? ` ${detail}` : ' Set NVIDIA_VISION_MODEL to a vision-capable model.'}`);
    this.name = 'VisionUnsupportedError';
  }
}

function apiKey() {
  return String(process.env.NVIDIA_API_KEY || '').trim();
}

async function request(url, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const key = apiKey();
  if (!key) throw new Error('NVIDIA_API_KEY is required for document extraction. Set it in backend/.env.');
  const res = await fetchImpl(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(Number(process.env.NVIDIA_REQUEST_TIMEOUT_MS) || 90_000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Keep the raw text for error reporting.
  }
  if (!res.ok) {
    const detail = json?.error?.message || json?.detail || json?.message || text.slice(0, 240);
    const error = new Error(detail || `NVIDIA returned HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return json;
}

function explicitModalities(entry) {
  const raw = entry?.input_modalities ?? entry?.modalities?.input ?? entry?.input_modalities_supported;
  return Array.isArray(raw) ? raw.map((x) => String(x).toLowerCase()) : null;
}

/** Returns { supported, model, method }. Re-checks after an API key or model change. */
export async function verifyImageInput({ model = VISION_MODEL, fetchImpl = fetch, force = false } = {}) {
  const key = `${BASE_URL}|${model}|${apiKey().slice(0, 12)}`;
  if (!force && verified.has(key)) return verified.get(key);
  if (!/^[\w.\-/]+$/.test(model)) throw new Error(`Invalid NVIDIA model id: ${model}`);

  let entry = null;
  try {
    entry = await request(`${BASE_URL}/models/${model}`, { fetchImpl });
  } catch (error) {
    if (error.status === 404) throw new Error(`NVIDIA model ${model} was not found. Set NVIDIA_VISION_MODEL to an available model.`);
    throw error;
  }
  const modalities = explicitModalities(entry);
  if (modalities && !modalities.some((x) => x.includes('image') || x.includes('vision'))) {
    throw new VisionUnsupportedError(model, `The catalog lists input modalities: ${modalities.join(', ')}.`);
  }
  if (modalities) {
    const result = { supported: true, model, method: 'catalog' };
    verified.set(key, result);
    return result;
  }

  // The hosted catalog does not publish modalities for every model: probe with a real image.
  const probeUrl = await probeImageUrl();
  try {
    await request(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      fetchImpl,
      body: {
        model,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with OK.' }, { type: 'image_url', image_url: { url: probeUrl } }] }],
        max_tokens: 16,
        temperature: 0,
      },
    });
  } catch (error) {
    if (/image|vision|multimodal|media|unsupported|does not support/i.test(error.message)) throw new VisionUnsupportedError(model, error.message);
    throw error;
  }
  const result = { supported: true, model, method: 'probe' };
  verified.set(key, result);
  return result;
}

function tryParseObject(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Escape literal control characters inside JSON strings and drop trailing commas outside strings. */
function sanitizeJsonText(raw) {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escape) { out += ch; escape = false; continue; }
      if (ch === '\\') { out += ch; escape = true; continue; }
      if (ch === '"') { out += ch; inString = false; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      const code = ch.charCodeAt(0);
      if (code < 0x20) continue;
      out += ch;
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    out += ch;
  }
  return out.replace(/,\s*([}\]])/g, '$1');
}

function extractBalancedObjects(src) {
  const results = [];
  let inString = false;
  let escape = false;
  let depth = 0;
  let start = -1;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        results.push(src.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return results;
}

/** Robust JSON extraction from a model response (handles <think> blocks, fences, prose, and unescaped newlines). */
export function parseJsonObject(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const candidates = [];
  for (const m of cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (m[1]) candidates.push(m[1].trim());
  }
  candidates.push(cleaned);
  for (const c of [...candidates]) {
    for (const obj of extractBalancedObjects(c)) candidates.push(obj);
  }
  for (const candidate of candidates) {
    const direct = tryParseObject(candidate);
    if (direct) return direct;
    const sanitized = tryParseObject(sanitizeJsonText(candidate));
    if (sanitized) return sanitized;
  }
  return null;
}

async function chat(body, fetchImpl) {
  const budget = Number(process.env.NVIDIA_VISION_MAX_TOKENS) || 12288;
  let lastReasoning = '';
  let lastTruncated = '';
  let useJsonMode = true;
  // Reasoning models can spend budget thinking or truncate JSON at finish_reason=length; escalate token budget automatically.
  for (const max_tokens of [budget, Math.min(Math.max(budget * 2, 16384), 24576)]) {
    let json;
    try {
      json = await request(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        fetchImpl,
        body: { model: VISION_MODEL, temperature: 0.1, max_tokens, ...(useJsonMode ? { response_format: { type: 'json_object' } } : {}), ...body },
      });
    } catch (err) {
      if (useJsonMode && err.status && err.status >= 400 && err.status < 500 && /response_format|json_object|unsupported/i.test(err.message)) {
        useJsonMode = false;
        json = await request(`${BASE_URL}/chat/completions`, {
          method: 'POST',
          fetchImpl,
          body: { model: VISION_MODEL, temperature: 0.1, max_tokens, ...body },
        });
      } else {
        throw err;
      }
    }
    const choice = json?.choices?.[0];
    const message = choice?.message ?? {};
    const content = typeof message.content === 'string' ? message.content.trim() : '';
    const finish = choice?.finish_reason;
    if (content && (finish !== 'length' || parseJsonObject(content))) return content;
    if (content) lastTruncated = content;
    lastReasoning = typeof message.reasoning_content === 'string' ? message.reasoning_content.slice(-160) : '';
  }
  if (lastTruncated) return lastTruncated;
  throw new Error(`NVIDIA returned no answer${lastReasoning ? ` (reasoning ended with: ${lastReasoning})` : ''}. Raise NVIDIA_VISION_MAX_TOKENS if the model keeps spending its budget reasoning.`);
}

async function chatJson(messages, fetchImpl, extraPayload = {}) {
  const content = await chat({ messages, ...extraPayload }, fetchImpl);
  let parsed = parseJsonObject(content);
  if (parsed) return parsed;
  const retryContent = await chat({
    messages: [
      ...messages,
      { role: 'assistant', content: content.slice(0, 2000) },
      { role: 'user', content: 'Your previous response was not valid parseable JSON. Output ONLY a single valid JSON object matching the requested schema, with no markdown fences and no commentary.' },
    ],
  }, fetchImpl);
  parsed = parseJsonObject(retryContent);
  if (!parsed) throw new Error('NVIDIA did not return valid JSON for this document.');
  return parsed;
}

/** Text-only extraction. Does not require image support. */
export async function extractFromText(prompt, text, fetchImpl = fetch) {
  return chatJson([{ role: 'user', content: `${prompt}\n\nDOCUMENT TEXT:\n${text}` }], fetchImpl);
}

/** Image-bearing extraction. The capability check runs first and cannot be bypassed. */
export async function extractFromImages(prompt, images, fetchImpl = fetch) {
  await verifyImageInput({ fetchImpl });
  const contentParts = [{ type: 'text', text: prompt }];
  for (const image of images) {
    contentParts.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${Buffer.from(image.buffer).toString('base64')}` } });
  }
  const parsed = await chatJson([{ role: 'user', content: contentParts }], fetchImpl);
  return { ...parsed, images_analysed: images.length };
}
